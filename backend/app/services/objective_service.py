"""
Calcul de l'avancement des objectifs mensuels d'un délégué.

Règles :
- une visite compte si elle est « réalisée » et que sa date réelle tombe dans le mois ;
- couverture A = médecins A du portefeuille visités au moins une fois dans le mois / total A ;
- pour le mois en cours, on compare au « prorata » : à mi-mois on attend ~50 % de l'objectif.
"""
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models import Doctor, Objective, ObjectiveProduct, User, Visit, VisitProduct
from app.models.enums import Segment, VisitStatus
from app.schemas.objective import ObjectiveProgress, ProductObjectiveProgress
from app.services import access
from app.services.dates import elapsed_fraction, month_bounds, now, period_label, period_of


def _pct(done: float, target: float) -> float:
    return round(100 * done / target, 1) if target else 0.0


def progress_status(visits_pct: float, expected_pct: float) -> str:
    """Compare le réalisé à ce qui est attendu à date."""
    if expected_pct <= 0:
        return "dans_les_temps"
    ratio = visits_pct / expected_pct
    if ratio >= 1.05:
        return "en_avance"
    if ratio >= 0.9:
        return "dans_les_temps"
    return "en_retard"


def coverage_for_period(db: Session, delegue_id: int, period: str, segment: str = Segment.A) -> tuple[int, int]:
    """(nb médecins du segment visités dans le mois, nb total de médecins du segment)."""
    start, end = month_bounds(period)
    doctor_ids = select(Doctor.id).where(Doctor.delegue_id == delegue_id, Doctor.segment == segment)
    total = db.scalar(select(func.count()).select_from(doctor_ids.subquery())) or 0
    visited = db.scalar(
        select(func.count(func.distinct(Visit.doctor_id))).where(
            Visit.doctor_id.in_(doctor_ids),
            Visit.status == VisitStatus.REALISEE,
            Visit.actual_at >= start,
            Visit.actual_at < end,
        )
    ) or 0
    return visited, total


def done_visits(db: Session, delegue_id: int, period: str) -> int:
    start, end = month_bounds(period)
    return db.scalar(
        select(func.count()).where(
            Visit.delegue_id == delegue_id,
            Visit.status == VisitStatus.REALISEE,
            Visit.actual_at >= start,
            Visit.actual_at < end,
        )
    ) or 0


def compute_progress(db: Session, objective: Objective) -> ObjectiveProgress:
    """Avancement d'un objectif mensuel."""
    today = now().date()
    period = objective.period
    start, end = month_bounds(period)
    is_current = period == period_of(today)

    done = done_visits(db, objective.delegue_id, period)
    visited_a, total_a = coverage_for_period(db, objective.delegue_id, period)

    # Présentations par produit dans le mois
    presentations = dict(
        db.execute(
            select(VisitProduct.product_id, func.count())
            .join(Visit, Visit.id == VisitProduct.visit_id)
            .where(
                Visit.delegue_id == objective.delegue_id,
                Visit.status == VisitStatus.REALISEE,
                Visit.actual_at >= start,
                Visit.actual_at < end,
            )
            .group_by(VisitProduct.product_id)
        ).all()
    )

    visits_pct = _pct(done, objective.target_visits)
    expected_pct = round(100 * elapsed_fraction(period, today), 1)
    return ObjectiveProgress(
        delegue_id=objective.delegue_id,
        period=period,
        label=period_label(period),
        is_current=is_current,
        target_visits=objective.target_visits,
        done_visits=done,
        visits_pct=visits_pct,
        expected_pct=expected_pct,
        target_coverage_a=objective.target_coverage_a,
        coverage_a=_pct(visited_a, total_a),
        a_doctors_total=total_a,
        a_doctors_visited=visited_a,
        products=[
            ProductObjectiveProgress(
                product_id=op.product_id,
                brand_name=op.product.brand_name,
                target=op.target_presentations,
                done=presentations.get(op.product_id, 0),
                pct=_pct(presentations.get(op.product_id, 0), op.target_presentations),
            )
            for op in objective.products
        ],
        status=progress_status(visits_pct, expected_pct),
    )


def _objectives_query(delegue_id: int):
    return (
        select(Objective)
        .where(Objective.delegue_id == delegue_id)
        .options(selectinload(Objective.products).selectinload(ObjectiveProduct.product))
    )


def get_progress(db: Session, delegue_id: int, period: str) -> ObjectiveProgress | None:
    objective = db.scalar(_objectives_query(delegue_id).where(Objective.period == period))
    return compute_progress(db, objective) if objective else None


def list_progress(db: Session, user: User, delegue_id: int | None = None) -> list[ObjectiveProgress]:
    """Tous les objectifs (du plus récent au plus ancien) d'un délégué."""
    target_id = delegue_id if delegue_id is not None else user.id
    access.check_delegue_access(db, user, target_id)
    objectives = db.scalars(_objectives_query(target_id).order_by(Objective.period.desc()))
    return [compute_progress(db, o) for o in objectives]
