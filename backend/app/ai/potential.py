"""
╔══════════════════════════════════════════════════════════════════════╗
║  IA n°6 — POTENTIEL A / B / C ET FRÉQUENCE DE VISITE CONSEILLÉE       ║
║  Statut : implémenté (score à base de règles, toujours expliqué)      ║
╚══════════════════════════════════════════════════════════════════════╝

D'où viennent les règles ?
    Dans les laboratoires, le ciblage se fait deux fois par an (janvier et juillet).
    Le délégué et son superviseur classent chaque médecin selon :
      - le potentiel du cabinet (A, B ou C) : selon le nombre de patients par jour ;
      - le potentiel de prescription (nos produits concernent-ils sa spécialité ? les prescrit-il ?).
    NOOR calcule ces deux critères, propose un potentiel et une fréquence de visite,
    et EXPLIQUE chaque point. Le délégué relit puis valide (ou non) : l'IA propose, il décide.

Score sur 100
    1. Fréquentation du cabinet (70 points) : patients vus par jour (critère principal).
    2. Potentiel de prescription (30 points) :
         -  5 points selon le nombre de nos produits qui visent sa spécialité ;
         - 25 points selon ses habitudes (régulier = 3, occasionnel = 2, non prescripteur = 1).
    Potentiel A ≥ 65, B ≥ 38, sinon C.

Fréquence conseillée
    Fréquences acceptables : A → F2 ou F1, B → F1 (F2 si score ≥ 55), C → F1 ou hors cible.
    Si la fréquence actuelle est acceptable, NOOR la garde (pas de changement inutile).
    Sinon : A → F2 si score ≥ 80 (sinon F1), B → F1,
    C → F1 s'il prescrit déjà un de nos produits (le fidéliser), sinon hors cible.
"""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.schemas import PotentialAssessment, PotentialFactor
from app.models import Doctor, Product, User
from app.models.enums import Frequency, PrescribingStatus, Segment
from app.services import access
from app.services.dates import now

THRESHOLD_A, THRESHOLD_B = 65, 38
STATUS_POINTS = {PrescribingStatus.REGULIER: 3, PrescribingStatus.OCCASIONNEL: 2, PrescribingStatus.NON_PRESCRIPTEUR: 1}
FREQ_TEXT = {"F2": "F2 (2 visites par mois)", "F1": "F1 (1 visite par mois)", None: "hors cible"}


def _cabinet_points(patients: int | None) -> tuple[int, str]:
    """Critère 1 : fréquentation du cabinet."""
    if patients is None:
        return 35, "Nombre de patients par jour non renseigné : valeur moyenne retenue (à compléter sur la fiche)"
    for minimum, points, text in [
        (35, 70, "cabinet très fréquenté"),
        (26, 60, "cabinet très fréquenté"),
        (18, 42, "fréquentation moyenne"),
        (12, 28, "fréquentation moyenne à faible"),
        (0, 10, "cabinet peu fréquenté"),
    ]:
        if patients >= minimum:
            return points, f"{patients} patients par jour : {text}"
    return 0, ""  # jamais atteint


def _prescription_points(doctor: Doctor, products: list[Product]) -> tuple[int, str, bool]:
    """Critère 2 : potentiel de prescription de nos produits. Renvoie (points, explication, prescrit déjà)."""
    status = {p.product_id: PrescribingStatus(p.status) for p in doctor.prescriptions}
    concerned = [p for p in products if doctor.specialty in p.target_specialties]
    prescribes = any(s != PrescribingStatus.NON_PRESCRIPTEUR for s in status.values())
    if not concerned:
        return 3, f"Aucun de nos produits ne vise les {doctor.specialty.lower()}s", prescribes
    breadth = round(5 * min(len(concerned), 4) / 4)
    habits = [STATUS_POINTS[status.get(p.id, PrescribingStatus.NON_PRESCRIPTEUR)] for p in concerned]
    habit_points = round(25 * (sum(habits) - len(habits)) / (2 * len(habits)))  # 0 si aucun, 25 si tous réguliers
    regular = [p.brand_name for p in concerned if status.get(p.id) == PrescribingStatus.REGULIER]
    occasional = [p.brand_name for p in concerned if status.get(p.id) == PrescribingStatus.OCCASIONNEL]
    n = len(concerned)
    parts = [f"{n} de nos produits visent sa spécialité" if n > 1 else "1 de nos produits vise sa spécialité"]
    if regular:
        parts.append(f"prescrit régulièrement {', '.join(regular)}")
    if occasional:
        parts.append(f"{'et' if regular else 'prescrit'} occasionnellement {', '.join(occasional)}")
    if not regular and not occasional:
        parts.append("ne prescrit encore aucun d'entre eux")
    return breadth + habit_points, " ; ".join(parts), prescribes


def _next_targeting() -> str:
    """Le ciblage est revu en janvier et en juillet."""
    today = now().date()
    if today.month < 7:
        return f"juillet {today.year}"
    return f"janvier {today.year + 1}"


def assess(doctor: Doctor, products: list[Product]) -> PotentialAssessment:
    """Calcule le potentiel proposé d'un médecin (sans rien modifier)."""
    cab_points, cab_text = _cabinet_points(doctor.patients_per_day)
    presc_points, presc_text, prescribes = _prescription_points(doctor, products)
    score = cab_points + presc_points
    proposed = Segment.A if score >= THRESHOLD_A else Segment.B if score >= THRESHOLD_B else Segment.C

    current = Frequency(doctor.frequency) if doctor.frequency else None
    acceptable = {
        Segment.A: {Frequency.F2, Frequency.F1},
        Segment.B: {Frequency.F1, Frequency.F2} if score >= 55 else {Frequency.F1},
        Segment.C: {Frequency.F1, None},
    }[proposed]
    if proposed == Segment.A:
        advised = Frequency.F2 if score >= 80 else Frequency.F1
        freq_reason = "Fort potentiel : 1 à 2 visites par mois (2 si le cabinet est très fréquenté)"
    elif proposed == Segment.B:
        advised, freq_reason = Frequency.F1, "Potentiel moyen : 1 visite par mois suffit"
    elif prescribes:
        advised = Frequency.F1
        freq_reason = "Petit potentiel, mais il prescrit déjà nos produits : 1 visite par mois pour le fidéliser"
    else:
        advised, freq_reason = None, "Petit potentiel et pas encore prescripteur : hors cible, visite occasionnelle"
    if current in acceptable and current != advised:
        advised = current
        freq_reason = f"La fréquence actuelle, {FREQ_TEXT[current.value if current else None]}, convient à un potentiel {proposed}"

    advised_value = advised.value if advised else None
    differs = proposed != doctor.segment or advised_value != doctor.frequency
    if not differs:
        summary = f"La fiche est cohérente : potentiel {proposed}, {FREQ_TEXT[advised_value]}."
    else:
        changes = []
        if proposed != doctor.segment:
            changes.append(f"potentiel {doctor.segment} → {proposed}")
        if advised_value != doctor.frequency:
            changes.append(f"ciblage {doctor.frequency or 'hors cible'} → {advised_value or 'hors cible'}")
        summary = f"NOOR propose de revoir la fiche ({', '.join(changes)}), score {score}/100."

    return PotentialAssessment(
        doctor_id=doctor.id,
        doctor_name=doctor.full_name,
        score=score,
        current_segment=doctor.segment,
        proposed_segment=proposed.value,
        current_frequency=doctor.frequency,
        advised_frequency=advised_value,
        factors=[
            PotentialFactor(label="Fréquentation du cabinet", points=cab_points, max_points=70, explanation=cab_text),
            PotentialFactor(label="Potentiel de prescription", points=presc_points, max_points=30,
                            explanation=presc_text),
        ],
        frequency_reason=freq_reason,
        summary=summary,
        differs=differs,
        next_targeting=_next_targeting(),
    )


def assess_doctor(db: Session, user: User, doctor_id: int) -> PotentialAssessment:
    doctor = access.get_doctor_or_403(db, user, doctor_id)
    return assess(doctor, list(db.scalars(select(Product))))


def to_review(db: Session, user: User, delegue_id: int | None = None, limit: int = 50) -> list[PotentialAssessment]:
    """Médecins dont la fiche diffère de la proposition (à revoir au prochain ciblage), les plus nets d'abord."""
    ids = access.resolve_delegue_ids(db, user, delegue_id)
    products = list(db.scalars(select(Product)))
    doctors = db.scalars(select(Doctor).where(Doctor.delegue_id.in_(ids)))
    results = [a for a in (assess(d, products) for d in doctors) if a.differs]
    # Les changements de potentiel d'abord (plus importants qu'un simple changement de fréquence)
    results.sort(key=lambda a: (a.proposed_segment == a.current_segment, -abs(a.score - 50)))
    return results[:limit]


def apply(db: Session, user: User, doctor_id: int, segment: str, frequency: str | None) -> PotentialAssessment:
    """Le délégué valide : la fiche prend le potentiel et la fréquence choisis."""
    from fastapi import HTTPException

    doctor = access.get_doctor_or_403(db, user, doctor_id)
    if segment not in {s.value for s in Segment}:
        raise HTTPException(400, "Potentiel inconnu (A, B ou C)")
    if frequency not in {None, *(f.value for f in Frequency)}:
        raise HTTPException(400, "Fréquence inconnue (F1, F2 ou vide)")
    doctor.segment, doctor.frequency = segment, frequency
    db.commit()
    return assess(doctor, list(db.scalars(select(Product))))
