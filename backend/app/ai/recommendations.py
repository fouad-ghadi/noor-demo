"""
╔══════════════════════════════════════════════════════════════════════╗
║  IA n°5 — RECOMMANDATIONS : qui visiter, quand, avec quels produits  ║
║  Statut : implémenté (version 1 : score à base de règles expliquées) ║
╚══════════════════════════════════════════════════════════════════════╝

Objectif
    Proposer au délégué une liste priorisée de visites, en expliquant TOUJOURS
    pourquoi (le délégué doit comprendre et avoir confiance).

Score d'un médecin (plus il est élevé, plus la visite est prioritaire)
    1. Retard de visite : jours depuis la dernière visite, rapportés au rythme
       attendu par le ciblage (F2 : 15 j, F1 : 30 j, hors cible : 90 j), et pondérés
       par la fréquence (un retard sur un F2 compte presque 4 fois plus que sur un hors cible).
       Jamais vu = compté comme deux fois le rythme attendu.
    2. Potentiel : segment A > B > C.
    3. Opportunité produit : produits ciblant sa spécialité qu'il prescrit peu
       (« occasionnel » ou « non prescripteur »), surtout s'ils sont en retard
       sur l'objectif du mois.
    4. Marché : un produit de sa spécialité perd des parts de marché sur son
       territoire (indice d'évolution < 97, données de ventes type IMS) → visite utile.
    Les médecins ayant déjà une visite planifiée sont exclus.

Quand ?
    Le créneau où le médecin a été le plus réceptif (part de visites favorables),
    sinon son créneau préféré. Les dates proposées sont réparties sur les
    prochains jours ouvrés (3 visites recommandées par jour au maximum, en plus de la tournée prévue).

Version 2 possible : apprendre ces poids à partir de l'historique
(probabilité de visite favorable, de passage au statut « prescripteur régulier »...).
"""
from collections import Counter, defaultdict
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.ai.schemas import VisitRecommendation
from app.models import Doctor, Product, User, Visit
from app.models.enums import Frequency, PrescribingStatus, Segment, VisitFeedback, VisitStatus
from app.services import access, sales_service
from app.services.dates import now, period_of
from app.services.doctor_service import last_visit_dates, next_planned_visits
from app.services.objective_service import get_progress

# Rythme de visite attendu selon le ciblage (en jours) ; None = hors cible
EXPECTED_INTERVAL = {Frequency.F2: 15, Frequency.F1: 30, None: 90}
FREQUENCY_TEXT = {Frequency.F2: "ciblé F2 (2 visites par mois)", Frequency.F1: "ciblé F1 (1 visite par mois)",
                  None: "hors cible"}
SEGMENT_BONUS = {Segment.A: 25, Segment.B: 12, Segment.C: 0}
# Poids du retard de visite selon la fréquence de ciblage
LATENESS_WEIGHT = {Frequency.F2: 30, Frequency.F1: 22, None: 8}
# En dessous de cet indice d'évolution, le produit perd nettement des parts de marché sur le territoire
LOSING_SHARE_IE = 97
SLOT_LABEL = {"matin": "le matin", "midi": "à midi", "apres_midi": "l'après-midi"}
VISITS_PER_DAY = 3
POSITIVE = {VisitFeedback.FAVORABLE, VisitFeedback.TRES_FAVORABLE}


def _slot_of(hour: int) -> str:
    return "matin" if hour < 12 else "midi" if hour < 14 else "apres_midi"


def _next_working_days(start: date, count: int) -> list[date]:
    days, d = [], start
    while len(days) < count:
        d += timedelta(days=1)
        if d.weekday() < 5:  # du lundi au vendredi
            days.append(d)
    return days


def recommend(db: Session, user: User, delegue_id: int | None = None, limit: int = 10) -> list[VisitRecommendation]:
    """Liste priorisée de visites à faire (délégué donné, ou toute l'équipe du superviseur)."""
    delegue_ids = access.resolve_delegue_ids(db, user, delegue_id)
    recos = [r for d_id in delegue_ids for r in _recommend_for(db, d_id)]
    recos.sort(key=lambda r: -r.score)
    recos = recos[:limit]
    # Dates : les plus prioritaires d'abord, 3 par jour ouvré
    days = _next_working_days(now().date(), len(recos) // VISITS_PER_DAY + 1)
    for i, r in enumerate(recos):
        r.suggested_date = days[i // VISITS_PER_DAY]
    return recos


def _recommend_for(db: Session, delegue_id: int) -> list[VisitRecommendation]:
    doctors = list(
        db.scalars(
            select(Doctor).where(Doctor.delegue_id == delegue_id).options(selectinload(Doctor.prescriptions))
        )
    )
    ids = [d.id for d in doctors]
    last = last_visit_dates(db, ids)
    planned = next_planned_visits(db, ids)
    products = list(db.scalars(select(Product)))
    today = now().date()

    # Produits en retard sur l'objectif du mois (présentations réalisées < rythme attendu)
    progress = get_progress(db, delegue_id, period_of(today))
    evolution = sales_service.evolution_index_by_territory(db)
    behind = (
        {p.product_id for p in progress.products if p.pct < progress.expected_pct * 0.9} if progress else set()
    )

    # Historique : réceptivité par créneau et objections « prix » récentes, par médecin
    slot_visits: dict[int, list[tuple[str, bool]]] = defaultdict(list)
    price_objections: dict[int, Counter] = defaultdict(Counter)
    history = db.scalars(
        select(Visit)
        .where(Visit.doctor_id.in_(ids), Visit.status == VisitStatus.REALISEE)
        .options(selectinload(Visit.objections))
    )
    for v in history:
        when = v.actual_at or v.planned_at
        slot_visits[v.doctor_id].append((_slot_of(when.hour), v.feedback in POSITIVE))
        if (today - when.date()).days <= 120:
            for o in v.objections:
                if o.category == "prix_eleve" and o.product_id:
                    price_objections[v.doctor_id][o.product_id] += 1

    recos = []
    for d in doctors:
        if d.id in planned:
            continue  # déjà une visite prévue : rien à recommander
        segment = Segment(d.segment)
        frequency = Frequency(d.frequency) if d.frequency else None
        last_dt = last.get(d.id)
        days = (today - last_dt.date()).days if last_dt else None
        reasons: list[str] = []

        # 1. Retard de visite
        interval = EXPECTED_INTERVAL[frequency]
        overdue = 2.0 if days is None else days / interval
        if overdue < 0.8:
            continue  # vu récemment : pas prioritaire
        score = min(overdue, 3.0) * LATENESS_WEIGHT[frequency] + SEGMENT_BONUS[segment]
        who = f"Médecin {FREQUENCY_TEXT[frequency]}, potentiel {segment}"
        if days is None:
            reasons.append(f"{who}, jamais visité")
        else:
            reasons.append(f"{who}, non visité depuis {days} jours (rythme conseillé : {interval} j)")

        # 2. Opportunités produit : produits de sa spécialité qu'il prescrit peu
        status = {p.product_id: p.status for p in d.prescriptions}
        opportunities = []
        for p in products:
            if d.specialty not in p.target_specialties:
                continue
            st = status.get(p.id, PrescribingStatus.NON_PRESCRIPTEUR)
            if st == PrescribingStatus.REGULIER:
                continue
            value = (8 if st == PrescribingStatus.OCCASIONNEL else 5) + (10 if p.id in behind else 0)
            opportunities.append((value, p, st))
        opportunities.sort(key=lambda o: -o[0])
        chosen = opportunities[:2]
        score += sum(o[0] for o in chosen)

        # 4. Marché : le produit de sa spécialité qui perd le plus de parts sur son territoire
        losing = sorted(
            (evolution[(d.territory, p.id)], p) for p in products
            if d.specialty in p.target_specialties and evolution.get((d.territory, p.id), 100) < LOSING_SHARE_IE
        )
        if losing:
            ie, product = losing[0]
            score += 12
            reasons.append(f"{product.brand_name} perd des parts de marché sur {d.territory} "
                           f"(indice d'évolution {ie:.0f})")
            if product.id not in {p.id for _, p, _ in chosen}:
                chosen = (chosen + [(0, product, status.get(product.id, PrescribingStatus.NON_PRESCRIPTEUR))])[-2:]
        for value, p, st in chosen:
            if value == 0:
                continue  # produit ajouté pour la raison « marché », déjà expliquée
            habit = "prescripteur occasionnel" if st == PrescribingStatus.OCCASIONNEL else "ne prescrit pas encore"
            late = ", produit en retard sur l'objectif du mois" if p.id in behind else ""
            reasons.append(f"{p.brand_name} : {habit}{late}")
            if price_objections[d.id][p.id] >= 2:
                reasons.append(f"Objection « prix » répétée sur {p.brand_name} : préparer l'argumentaire")

        # 3. Quand ? Le créneau le plus favorable de l'historique (au moins 2 visites)
        by_slot: dict[str, list[bool]] = defaultdict(list)
        for slot, positive in slot_visits[d.id]:
            by_slot[slot].append(positive)
        rated = {s: sum(v) / len(v) for s, v in by_slot.items() if len(v) >= 2}
        if rated:
            slot = max(rated, key=rated.get)
            if rated[slot] >= 0.6:  # on ne cite la raison que si elle est nette
                reasons.append(f"Plus réceptif {SLOT_LABEL[slot]} ({round(100 * rated[slot])} % de visites favorables)")
        else:
            slot = d.preferred_slot or "matin"

        recos.append(
            VisitRecommendation(
                doctor_id=d.id,
                doctor_name=d.full_name,
                suggested_date=today,  # remplacée dans recommend() selon le rang
                suggested_slot=slot,
                product_ids=[p.id for _, p, _ in chosen],
                reasons=reasons,
                score=round(min(score / 140, 1.0), 2),
            )
        )
    return recos
