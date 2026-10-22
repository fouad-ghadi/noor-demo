"""
Statistiques des tableaux de bord, calculées côté serveur.

- `delegue_dashboard` : tout ce qu'affiche le tableau de bord d'un délégué,
  en UNE seule réponse (agenda du jour, KPIs, graphique, médecins à revoir, alertes).
- `team_overview`     : comparaison des délégués pour le superviseur.

Le futur module de recommandations (app/ai/recommendations.py) pourra
réutiliser `doctors_to_revisit` comme point de départ.
"""
from collections import Counter
from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models import Doctor, User, Visit, VisitObjection, VisitProduct, VisitSample
from app.models.enums import OBJECTION_CATEGORIES, Frequency, Role, Segment, VisitStatus
from app.schemas.stats import (
    CountItem,
    DashboardKpis,
    DashboardOut,
    DoctorToRevisit,
    MonthPoint,
    RegionStats,
    TeamMemberStats,
    TeamOut,
    WeekPoint,
)
from app.schemas.visit import VisitOut
from app.services import access, activity_service, alert_service, objective_service
from app.services.dates import month_bounds, now, period_label, period_of, previous_periods, week_start
from app.services.doctor_service import last_visit_dates, next_planned_visits

# Médecin ciblé « à revoir » : plus d'un cycle de visite sans le voir
REVISIT_THRESHOLD_DAYS = {Frequency.F2: 21, Frequency.F1: 35}
WEEKS_IN_CHART = 13  # ~3 mois


# ---------------------------------------------------------------------------
# Briques de calcul
# ---------------------------------------------------------------------------

def _visits_in_month(db: Session, delegue_id: int, period: str):
    start, end = month_bounds(period)
    return select(Visit).where(
        Visit.delegue_id == delegue_id, Visit.planned_at >= start, Visit.planned_at < end
    )


def cancelled_count(db: Session, delegue_id: int, period: str) -> int:
    """Visites annulées ou reportées dans le mois."""
    q = _visits_in_month(db, delegue_id, period).where(
        Visit.status.in_([VisitStatus.ANNULEE, VisitStatus.REPORTEE])
    )
    return db.scalar(select(func.count()).select_from(q.subquery())) or 0


def pending_reports(db: Session, delegue_id: int) -> tuple[int, int]:
    """(comptes-rendus en attente, dont en retard de plus de 48 h)."""
    current = now()
    base = select(func.count()).where(
        Visit.delegue_id == delegue_id, Visit.status == VisitStatus.PLANIFIEE
    )
    pending = db.scalar(base.where(Visit.planned_at < current)) or 0
    late = db.scalar(
        base.where(Visit.planned_at < current - timedelta(hours=alert_service.LATE_REPORT_HOURS))
    ) or 0
    return pending, late


def visits_per_week(db: Session, delegue_id: int, weeks: int = WEEKS_IN_CHART) -> list[WeekPoint]:
    """Visites réalisées et annulées par semaine (lundi → dimanche) sur les N dernières semaines."""
    first_monday = week_start(now().date()) - timedelta(weeks=weeks - 1)
    rows = db.execute(
        select(Visit.planned_at, Visit.actual_at, Visit.status).where(
            Visit.delegue_id == delegue_id,
            Visit.planned_at >= datetime.combine(first_monday, datetime.min.time()),
            Visit.status.in_([VisitStatus.REALISEE, VisitStatus.ANNULEE, VisitStatus.REPORTEE]),
        )
    )
    done: Counter = Counter()
    cancelled: Counter = Counter()
    for planned_at, actual_at, status in rows:
        week = week_start((actual_at or planned_at).date())
        if status == VisitStatus.REALISEE:
            done[week] += 1
        else:
            cancelled[week] += 1
    return [
        WeekPoint(week_start=w, done=done[w], cancelled=cancelled[w])
        for w in (first_monday + timedelta(weeks=i) for i in range(weeks))
    ]


def doctors_to_revisit(db: Session, delegue_id: int) -> list[DoctorToRevisit]:
    """
    Médecins ciblés non visités depuis plus d'un cycle (F2 : 21 jours, F1 : 35 jours) ou jamais,
    triés : F2 d'abord, puis potentiel A > B > C, puis du plus ancien au plus récent.
    """
    doctors = list(
        db.scalars(select(Doctor).where(Doctor.delegue_id == delegue_id, Doctor.frequency.isnot(None)))
    )
    ids = [d.id for d in doctors]
    last = last_visit_dates(db, ids)
    planned = next_planned_visits(db, ids)
    today = now().date()

    result = []
    for d in doctors:
        last_dt = last.get(d.id)
        days = (today - last_dt.date()).days if last_dt else None
        if days is not None and days < REVISIT_THRESHOLD_DAYS[Frequency(d.frequency)]:
            continue
        result.append(
            DoctorToRevisit(
                doctor_id=d.id,
                doctor_name=d.full_name,
                specialty=d.specialty,
                segment=d.segment,
                frequency=d.frequency,
                city=d.city,
                district=d.district,
                last_visit_date=last_dt.date() if last_dt else None,
                days_since_last_visit=days,
                next_visit_at=planned[d.id].date() if d.id in planned else None,
            )
        )
    # Jamais visité = le plus urgent (on le traite comme 9999 jours)
    result.sort(key=lambda r: (r.frequency != Frequency.F2, r.segment,
                               -(r.days_since_last_visit if r.days_since_last_visit is not None else 9999)))
    return result


def top_objections(db: Session, delegue_ids: list[int], days: int = 90, limit: int = 5) -> list[CountItem]:
    """Objections les plus fréquentes sur la période."""
    since = now() - timedelta(days=days)
    rows = db.execute(
        select(VisitObjection.category, func.count())
        .join(Visit, Visit.id == VisitObjection.visit_id)
        .where(Visit.delegue_id.in_(delegue_ids), Visit.actual_at >= since)
        .group_by(VisitObjection.category)
        .order_by(func.count().desc())
        .limit(limit)
    )
    return [CountItem(key=k, label=OBJECTION_CATEGORIES.get(k, k), count=c) for k, c in rows]


# ---------------------------------------------------------------------------
# Tableau de bord du délégué
# ---------------------------------------------------------------------------

def delegue_dashboard(db: Session, user: User, delegue_id: int | None = None) -> DashboardOut:
    """
    Données complètes du tableau de bord d'un délégué.
    Un superviseur peut passer `delegue_id` pour voir le tableau de bord d'un membre de l'équipe.
    """
    target_id = delegue_id if delegue_id is not None else user.id
    access.check_delegue_access(db, user, target_id)
    delegue = db.get(User, target_id)

    # Les alertes dépendent du temps qui passe (une visite d'hier devient « en retard ») :
    # on les recalcule à chaque ouverture du tableau de bord.
    alert_service.refresh_alerts(db, target_id)

    current = now()
    today = current.date()
    period = period_of(today)

    # Agenda du jour
    day_start = datetime.combine(today, datetime.min.time())
    today_visits = db.scalars(
        select(Visit)
        .where(
            Visit.delegue_id == target_id,
            Visit.planned_at >= day_start,
            Visit.planned_at < day_start + timedelta(days=1),
        )
        .order_by(Visit.planned_at)
        .options(
            selectinload(Visit.doctor),
            selectinload(Visit.products).selectinload(VisitProduct.product),
            selectinload(Visit.samples).selectinload(VisitSample.product),
            selectinload(Visit.objections),
        )
    )

    progress = objective_service.get_progress(db, target_id, period)
    pending, late = pending_reports(db, target_id)
    month_start, month_end = month_bounds(period)
    planned_remaining = db.scalar(
        select(func.count()).where(
            Visit.delegue_id == target_id,
            Visit.status == VisitStatus.PLANIFIEE,
            Visit.planned_at >= current,
            Visit.planned_at < month_end,
        )
    ) or 0

    if progress:
        kpis = DashboardKpis(
            visits_done=progress.done_visits,
            visits_target=progress.target_visits,
            visits_expected_to_date=round(progress.target_visits * progress.expected_pct / 100),
            visits_planned_remaining=planned_remaining,
            coverage_a=progress.coverage_a,
            coverage_a_target=progress.target_coverage_a,
            pending_reports=pending,
            late_reports=late,
            cancelled_month=cancelled_count(db, target_id, period),
        )
    else:  # pas d'objectif défini pour ce mois
        visited, total = objective_service.coverage_for_period(db, target_id, period)
        kpis = DashboardKpis(
            visits_done=objective_service.done_visits(db, target_id, period),
            visits_target=0,
            visits_expected_to_date=0,
            visits_planned_remaining=planned_remaining,
            coverage_a=round(100 * visited / total, 1) if total else 0.0,
            coverage_a_target=0,
            pending_reports=pending,
            late_reports=late,
            cancelled_month=cancelled_count(db, target_id, period),
        )

    revisit = doctors_to_revisit(db, target_id)
    return DashboardOut(
        delegue_id=target_id,
        delegue_name=delegue.name,
        region=delegue.region,
        today=today,
        today_visits=[VisitOut.from_model(v) for v in today_visits],
        kpis=kpis,
        activity=activity_service.delegue_activity(db, delegue, period),
        objective=progress,
        visits_per_week=visits_per_week(db, target_id),
        doctors_to_revisit=revisit[:8],
        doctors_to_revisit_total=len(revisit),
        alerts=alert_service.list_alerts(db, user, delegue_id=target_id, limit=6),
        top_objections=top_objections(db, [target_id]),
    )


# ---------------------------------------------------------------------------
# Vue équipe (superviseur)
# ---------------------------------------------------------------------------

def _month_history(db: Session, delegue_id: int, periods: list[str]) -> list[MonthPoint]:
    points = []
    for p in periods:
        progress = objective_service.get_progress(db, delegue_id, p)
        done = progress.done_visits if progress else objective_service.done_visits(db, delegue_id, p)
        target = progress.target_visits if progress else 0
        points.append(
            MonthPoint(period=p, label=period_label(p), done=done, target=target,
                       pct=round(100 * done / target, 1) if target else 0.0)
        )
    return points


def team_overview(db: Session, user: User) -> TeamOut:
    """Tableau comparatif des délégués de l'équipe du superviseur."""
    if user.role != Role.SUPERVISEUR:
        raise HTTPException(403, "Vue réservée aux superviseurs")
    delegue_ids = access.visible_delegue_ids(db, user)
    delegues = list(db.scalars(select(User).where(User.id.in_(delegue_ids)).order_by(User.name)))

    period = period_of(now().date())
    periods = previous_periods(period, 6)

    members: list[TeamMemberStats] = []
    regions: list[RegionStats] = []
    for d in delegues:
        alert_service.refresh_alerts(db, d.id)
        progress = objective_service.get_progress(db, d.id, period)
        pending, late = pending_reports(db, d.id)
        cancelled = cancelled_count(db, d.id, period)
        history = _month_history(db, d.id, periods)
        done = progress.done_visits if progress else 0
        doctors_count = db.scalar(select(func.count()).where(Doctor.delegue_id == d.id)) or 0

        members.append(
            TeamMemberStats(
                delegue_id=d.id,
                name=d.name,
                region=d.region,
                doctors_count=doctors_count,
                visits_done=done,
                visits_target=progress.target_visits if progress else 0,
                achievement_pct=progress.visits_pct if progress else 0.0,
                expected_pct=progress.expected_pct if progress else 0.0,
                coverage_a=progress.coverage_a if progress else 0.0,
                coverage_a_target=progress.target_coverage_a if progress else 0,
                cancelled=cancelled,
                cancel_rate=round(100 * cancelled / (done + cancelled), 1) if done + cancelled else 0.0,
                pending_reports=pending,
                late_reports=late,
                status=progress.status if progress else "dans_les_temps",
                history=history,
            )
        )

        coverage = {}
        for seg in (Segment.A, Segment.B, Segment.C):
            visited, total = objective_service.coverage_for_period(db, d.id, period, seg)
            coverage[seg.value] = round(100 * visited / total, 1) if total else 0.0
        regions.append(
            RegionStats(
                region=d.region,
                delegue_name=d.name,
                doctors=doctors_count,
                coverage_by_segment=coverage,
                visits_by_month=history,
            )
        )

    total_done = sum(m.visits_done for m in members)
    total_target = sum(m.visits_target for m in members)
    totals = {
        "visits_done": total_done,
        "visits_target": total_target,
        "achievement_pct": round(100 * total_done / total_target, 1) if total_target else 0.0,
        "expected_pct": members[0].expected_pct if members else 0.0,
        "coverage_a": round(sum(m.coverage_a for m in members) / len(members), 1) if members else 0.0,
        "cancelled": sum(m.cancelled for m in members),
        "pending_reports": sum(m.pending_reports for m in members),
        "late_reports": sum(m.late_reports for m in members),
        "doctors": sum(m.doctors_count for m in members),
    }
    return TeamOut(
        supervisor_name=user.name,
        period=period,
        period_label=period_label(period),
        members=members,
        regions=regions,
        totals=totals,
        top_objections=top_objections(db, delegue_ids),
    )
