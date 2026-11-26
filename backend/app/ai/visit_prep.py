"""
╔══════════════════════════════════════════════════════════════════════╗
║  IA n°7 — « PRÉPARER LA VISITE »                                      ║
║  Statut : implémenté (règles expliquées, aucune clé nécessaire)       ║
╚══════════════════════════════════════════════════════════════════════╝

Avant d'entrer chez le médecin, le délégué ouvre une fiche qui rassemble :
    1. le dernier compte-rendu (accueil, objections, suite prévue, échantillons remis) ;
    2. les produits à pousser, chacun avec un SCORE et son « pourquoi » :
         - suite prévue au dernier compte-rendu (« présenter le nouveau dosage de ... ») ;
         - habitude de prescription du médecin (à convaincre, à faire passer en régulier, à entretenir) ;
         - objectif du mois en retard pour ce produit ;
         - marché du territoire (le produit perd ou gagne des parts : indice d'évolution) ;
         - saisonnalité (mois forts du produit) ;
         - marge pour le laboratoire ;
         - circuit de vente (pharmacie ou parapharmacie) ;
    3. l'argument conseillé : la réponse à sa dernière objection s'il y en a une, sinon un message clé ;
    4. les échantillons à remettre (quantité selon le potentiel, dernier n° de lot remis).
Rien n'est enregistré : le délégué lit, puis fait sa visite et son compte-rendu.
"""
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.ai.schemas import LastReport, ProductToPush, ScoreFactor, VisitPreparation
from app.models import Doctor, PharmacovigilanceCase, Product, User, Visit
from app.models.visit import VisitSample
from app.models.enums import OBJECTION_CATEGORIES, PrescribingStatus, PvCaseStatus, VisitStatus
from app.services import access, sales_service
from app.services.dates import now, period_of
from app.services.objective_service import get_progress

MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre",
          "novembre", "décembre"]
WEEKDAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]
SLOTS = {"matin": "plutôt le matin", "midi": "plutôt à midi", "apres_midi": "plutôt l'après-midi"}
SAMPLES_BY_SEGMENT = {"A": 3, "B": 2, "C": 1}
MAX_PRODUCTS = 3
LOSING_SHARE_IE = 97  # même seuil que le copilote (recommendations.py)

# Réponse conseillée à chaque objection (mots à chercher dans les messages clés, puis conseil général)
OBJECTION_TIPS: dict[str, tuple[list[str], str]] = {
    "prix_eleve": (["prix", "amo", "rembours"], "Ramener le prix au coût par jour de traitement et rappeler le remboursement"),
    "prefere_generique": (["prix", "qualit"], "Rappeler la qualité de fabrication et la constance de l'effet"),
    "concurrent_satisfaisant": ([], "Proposer un essai sur quelques patients ciblés, puis faire le point à la prochaine visite"),
    "etudes_locales": (["démontr", "étude", "référence"], "Apporter les données cliniques de l'aide de visite"),
    "effets_indesirables": (["tolérance", "toléré"], "Rassurer avec le profil de tolérance du RCP (section effets indésirables)"),
    "remboursement": (["amo", "rembours"], "Confirmer le remboursement AMO / CNOPS"),
    "disponibilite": ([], "Rassurer sur la disponibilité : stock vérifié chez les grossistes du secteur"),
    "habitudes": (["une prise", "une seule", "pratique"], "Mettre en avant la simplicité d'utilisation"),
    "posologie": (["une prise", "une seule", "dosage", "forme"], "Présenter les formes et dosages disponibles"),
}


def _days_ago(days: int) -> str:
    """« aujourd'hui », « hier » ou « il y a 5 jours »."""
    return "aujourd'hui" if days <= 0 else "hier" if days == 1 else f"il y a {days} jours"


def _reception_text(doctor: Doctor) -> str:
    slot = SLOTS.get(doctor.preferred_slot or "", "")
    if not doctor.reception_days:
        days = "reçoit tous les jours"
    else:
        names = [WEEKDAYS[int(d)] for d in doctor.reception_days.split(",")]
        days = "reçoit le " + (", le ".join(names[:-1]) + " et le " + names[-1] if len(names) > 1 else names[0])
    return f"{days}, {slot}" if slot else days


def _last_report(db: Session, doctor: Doctor) -> tuple[LastReport | None, Visit | None]:
    visit = db.scalars(
        select(Visit)
        .where(Visit.doctor_id == doctor.id, Visit.status == VisitStatus.REALISEE, Visit.reported_at.isnot(None))
        .order_by(Visit.planned_at.desc())
        .options(selectinload(Visit.products), selectinload(Visit.samples), selectinload(Visit.objections))
        .limit(1)
    ).first()
    if visit is None:
        return None, None
    when = visit.actual_at or visit.planned_at
    return LastReport(
        visit_id=visit.id,
        date=when.date(),
        days_ago=(now().date() - when.date()).days,
        feedback=visit.feedback,
        prescription_feedback=visit.prescription_feedback,
        notes=visit.notes,
        next_step=visit.next_step,
        products=[vp.product.brand_name for vp in visit.products],
        objections=[OBJECTION_CATEGORIES.get(o.category, o.category)
                    + (f" ({o.product.brand_name})" if o.product else "") for o in visit.objections],
        samples=[f"{s.quantity} × {s.product.brand_name}" + (f" (lot {s.lot_number})" if s.lot_number else "")
                 for s in visit.samples],
    ), visit


def _last_lots(db: Session, delegue_id: int) -> dict[int, str]:
    """Dernier n° de lot remis par le délégué, pour chaque produit."""
    rows = db.execute(
        select(VisitSample.product_id, VisitSample.lot_number)
        .join(Visit, Visit.id == VisitSample.visit_id)
        .where(Visit.delegue_id == delegue_id, VisitSample.lot_number.isnot(None))
        .order_by(Visit.planned_at)
    )
    return {pid: lot for pid, lot in rows}


def _argument(product: Product, objection: str | None) -> tuple[str, str]:
    """Argument conseillé : réponse à la dernière objection sur ce produit, sinon le premier message clé."""
    messages = product.key_messages or [product.description or product.brand_name]
    if objection and objection in OBJECTION_TIPS:
        words, tip = OBJECTION_TIPS[objection]
        match = next((m for m in messages if any(w in m.lower() for w in words)), None)
        why = f"Objection « {OBJECTION_CATEGORIES[objection].lower()} » à la dernière visite"
        return (f"{match}. {tip}." if match else f"{tip}."), why
    return messages[0], "Message clé principal du produit"


def _score_product(product: Product, status: str, behind: bool, ie: float | None, month: int,
                   presented_last: bool, next_step: str | None) -> tuple[int, list[ScoreFactor]]:
    factors: list[ScoreFactor] = []
    if next_step and product.brand_name.lower() in next_step.lower():
        factors.append(ScoreFactor(label="Suite prévue", points=20,
                                   explanation=f"Prévu à la dernière visite : « {next_step} »"))
    habit = {
        PrescribingStatus.OCCASIONNEL: (30, "Prescripteur occasionnel : à faire passer en prescripteur régulier"),
        PrescribingStatus.NON_PRESCRIPTEUR: (24, "Ne le prescrit pas encore : à convaincre"),
        PrescribingStatus.REGULIER: (10, "Prescripteur régulier : à entretenir"),
    }[PrescribingStatus(status)]
    factors.append(ScoreFactor(label="Habitude de prescription", points=habit[0], explanation=habit[1]))
    if behind:
        factors.append(ScoreFactor(label="Objectif du mois", points=15,
                                   explanation="Produit en retard sur votre objectif de présentations du mois"))
    if ie is not None and ie < LOSING_SHARE_IE:
        factors.append(ScoreFactor(label="Marché du territoire", points=12,
                                   explanation=f"Perd des parts de marché sur le territoire (indice d'évolution {ie:.0f})"))
    elif ie is not None and ie >= 103:
        factors.append(ScoreFactor(label="Marché du territoire", points=5,
                                   explanation=f"Gagne des parts sur le territoire (indice {ie:.0f}) : profiter de l'élan"))
    next_month = month % 12 + 1
    if month in product.peak_months:
        factors.append(ScoreFactor(label="Saisonnalité", points=12,
                                   explanation=f"{MONTHS[month - 1].capitalize()} est un mois fort pour ce produit"))
    elif next_month in product.peak_months:
        factors.append(ScoreFactor(label="Saisonnalité", points=6,
                                   explanation=f"La saison forte commence en {MONTHS[next_month - 1]} : prendre de l'avance"))
    margin = {"forte": (8, "Marge forte pour le laboratoire"), "moyenne": (4, "Marge moyenne pour le laboratoire"),
              "faible": (0, "")}[product.margin_level]
    if margin[0]:
        factors.append(ScoreFactor(label="Marge", points=margin[0], explanation=margin[1]))
    if product.channel == "parapharmacie":
        factors.append(ScoreFactor(label="Circuit de vente", points=3,
                                   explanation="Vendu aussi en parapharmacie : conseil direct au patient, sans ordonnance"))
    if presented_last and not (next_step and product.brand_name.lower() in next_step.lower()):
        factors.append(ScoreFactor(label="Déjà présenté", points=-6,
                                   explanation="Déjà présenté à la dernière visite : varier le message"))
    return max(0, min(100, sum(f.points for f in factors))), factors



def prepare(db: Session, user: User, doctor_id: int) -> VisitPreparation:
    doctor: Doctor = access.get_doctor_or_403(db, user, doctor_id)
    today = now().date()
    last, last_visit = _last_report(db, doctor)
    products = list(db.scalars(select(Product)))
    status = {p.product_id: p.status for p in doctor.prescriptions}
    progress = get_progress(db, doctor.delegue_id, period_of(today))
    behind = ({p.product_id for p in progress.products if p.pct < progress.expected_pct * 0.9}
              if progress else set())
    evolution = sales_service.evolution_index_by_territory(db)
    lots = _last_lots(db, doctor.delegue_id)
    last_objection = {o.product_id: o.category for o in (last_visit.objections if last_visit else []) if o.product_id}
    any_objection = next((o.category for o in (last_visit.objections if last_visit else [])), None)
    presented = {vp.product_id for vp in (last_visit.products if last_visit else [])}

    scored = []
    for p in products:
        if doctor.specialty not in p.target_specialties and p.id not in status:
            continue
        st = status.get(p.id, PrescribingStatus.NON_PRESCRIPTEUR)
        score, factors = _score_product(p, st, p.id in behind, evolution.get((doctor.territory, p.id)),
                                        today.month, p.id in presented, last.next_step if last else None)
        scored.append((score, p, factors))
    scored.sort(key=lambda x: -x[0])

    to_push = []
    for i, (score, p, factors) in enumerate(scored[:MAX_PRODUCTS]):
        # L'objection générale (sans produit) est rattachée au produit n° 1
        objection = last_objection.get(p.id) or (any_objection if i == 0 and not last_objection else None)
        argument, why = _argument(p, objection)
        to_push.append(ProductToPush(
            product_id=p.id, brand_name=p.brand_name, molecule=p.molecule, channel=p.channel, score=score,
            factors=factors, argument=argument, argument_why=why,
            samples_quantity=SAMPLES_BY_SEGMENT.get(doctor.segment, 1) if i < 2 else 1,
            sample_unit=p.sample_unit, sample_lot=lots.get(p.id),
        ))

    reminders = []
    if last and last.next_step:
        reminders.append(f"Suite prévue à la dernière visite : {last.next_step}")
    open_pv = db.scalars(
        select(PharmacovigilanceCase).join(Visit, Visit.id == PharmacovigilanceCase.visit_id)
        .where(Visit.doctor_id == doctor.id, PharmacovigilanceCase.status == PvCaseStatus.A_DECLARER)
    ).first()
    if open_pv:
        reminders.append("Un cas de pharmacovigilance chez ce médecin n'est pas encore déclaré : le faire avant la visite")
    if doctor.patients_per_day is None:
        reminders.append("Demander le nombre de patients par jour (sert au calcul du potentiel)")

    if last:
        intro = f"Dernière visite {_days_ago(last.days_ago)}"
        if last.objections:
            first = last.objections[0]
            intro += f", objection : {first[0].lower()}{first[1:]}"
    else:
        intro = "Première visite chez ce médecin"
    focus = ", ".join(t.brand_name for t in to_push[:2])
    briefing = f"{intro}. Priorité du jour : {focus}." if focus else f"{intro}."

    # Objectifs de la visite : ce que le délégué veut obtenir en sortant du cabinet
    month_start = datetime.combine(today.replace(day=1), datetime.min.time())
    this_month = db.query(Visit).filter(Visit.doctor_id == doctor.id, Visit.status == VisitStatus.REALISEE,
                                        Visit.planned_at >= month_start).count()
    objectives = []
    if last and last.next_step:
        objectives.append(f"Tenir l'engagement pris : {last.next_step[0].lower()}{last.next_step[1:]}")
    if last and last.objections:
        objectives.append(f"Lever l'objection « {last.objections[0]} » avec l'argument conseillé")
    for t in to_push[:2]:
        st = status.get(t.product_id, PrescribingStatus.NON_PRESCRIPTEUR)
        objectives.append({
            PrescribingStatus.NON_PRESCRIPTEUR: f"Obtenir un essai de {t.brand_name} sur quelques patients",
            PrescribingStatus.OCCASIONNEL: f"Faire passer {t.brand_name} en prescription régulière",
            PrescribingStatus.REGULIER: f"Entretenir {t.brand_name} : recueillir les retours des patients",
        }[PrescribingStatus(st)])
    if doctor.frequency == "F2":
        objectives.append(f"Tenir le ciblage F2 : visite n° {this_month + 1} sur 2 ce mois-ci")
    elif doctor.frequency == "F1" and this_month == 0:
        objectives.append("Tenir le ciblage F1 : c'est la visite du mois")

    return VisitPreparation(
        objectives=objectives[:5], address=doctor.address, establishment=doctor.establishment,
        district=doctor.district, phone=doctor.phone, visits_this_month=this_month,
        last_visit_date=last_visit.planned_at.date() if last_visit else None,
        doctor_id=doctor.id, doctor_name=doctor.full_name, specialty=doctor.specialty, segment=doctor.segment,
        frequency=doctor.frequency, patients_per_day=doctor.patients_per_day, reception=_reception_text(doctor),
        visits_count=db.query(Visit).filter(Visit.doctor_id == doctor.id, Visit.status == VisitStatus.REALISEE).count(),
        last_report=last, products=to_push, reminders=reminders, briefing=briefing,
    )
