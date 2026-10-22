"""
Indicateurs d'activité terrain, calculés comme dans les rapports mensuels des laboratoires.

- Période (jours)   : jours ouvrés du mois — lundi → vendredi = 1 jour, samedi matin = ½ jour.
                      Pour le mois en cours : jusqu'à aujourd'hui inclus (indicateurs « à date »).
- Événements        : jours hors terrain (réunion, formation, congrès, congé, jour férié...).
- Jours travaillés  = période − événements.
- Ciblage           : médecins ciblés (fréquence F1 ou F2).
- Calls             : visites réalisées.     Contacts : médecins différents visités.
- Moyenne de visites = calls / jours travaillés.
- Couverture        = médecins ciblés visités / ciblage.
- CPA (Call Plan Adherence) = médecins ciblés vus à la bonne fréquence / ciblage
                      (F1 : au moins 1 visite dans le mois, F2 : au moins 2).

Le ciblage pris en compte est celui d'aujourd'hui (la démo ne garde pas l'historique des cibles).
"""
from collections import Counter
from datetime import date, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Doctor, Event, User, Visit
from app.models.enums import VISITS_PER_MONTH, EventType, Frequency, Role, VisitStatus
from app.schemas.activity import (
    ActivityOut,
    ActivityRow,
    ActivityTrendPoint,
    EventBreakdown,
    EventCreate,
    EventOut,
)
from app.services import access
from app.services.dates import month_bounds, now, period_label, period_of, previous_periods

HISTORY_MONTHS = 6


# ---------------------------------------------------------------------------
# Jours de la période
# ---------------------------------------------------------------------------

def day_weight(d: date) -> float:
    """Poids d'un jour dans la période : 1 en semaine, ½ le samedi (matinée), 0 le dimanche."""
    return 1.0 if d.weekday() < 5 else 0.5 if d.weekday() == 5 else 0.0


def period_range(period: str) -> tuple[date, date]:
    """[premier jour, dernier jour pris en compte] : pour le mois en cours, on s'arrête à aujourd'hui."""
    start, end = month_bounds(period)
    last = min((end - timedelta(days=1)).date(), now().date())
    return start.date(), last


def period_days(first: date, last: date) -> float:
    total, d = 0.0, first
    while d <= last:
        total += day_weight(d)
        d += timedelta(days=1)
    return total


def event_days_by_type(db: Session, delegue_ids: list[int], first: date, last: date) -> Counter:
    """Jours d'événements par type (un samedi compte au plus pour ½ jour)."""
    days: Counter = Counter()
    rows = db.scalars(select(Event).where(Event.delegue_id.in_(delegue_ids), Event.day >= first, Event.day <= last))
    for e in rows:
        days[e.type] += min(e.duration_days, day_weight(e.day))
    return days


# ---------------------------------------------------------------------------
# Indicateurs d'un délégué / de l'équipe
# ---------------------------------------------------------------------------

def _pct(part: float, whole: float) -> float:
    return round(100 * part / whole, 1) if whole else 0.0


def _row(name: str, region: str, delegue_id: int | None, period_days_: float, events: float,
         frequencies: dict[int, str | None], visits_by_doctor: Counter) -> ActivityRow:
    """Assemble une ligne à partir des comptes bruts (sert aussi pour la ligne « Équipe »)."""
    targeted = {d: f for d, f in frequencies.items() if f}
    f1 = [d for d, f in targeted.items() if f == Frequency.F1]
    f2 = [d for d, f in targeted.items() if f == Frequency.F2]
    f1_ok = sum(visits_by_doctor[d] >= VISITS_PER_MONTH[Frequency.F1] for d in f1)
    f2_ok = sum(visits_by_doctor[d] >= VISITS_PER_MONTH[Frequency.F2] for d in f2)
    visited_targets = sum(1 for d in targeted if visits_by_doctor[d] > 0)
    calls = sum(visits_by_doctor.values())
    worked = max(period_days_ - events, 0.0)
    return ActivityRow(
        delegue_id=delegue_id,
        name=name,
        region=region,
        period_days=period_days_,
        event_days=events,
        worked_days=worked,
        targeted=len(targeted),
        targeted_f1=len(f1),
        targeted_f2=len(f2),
        calls=calls,
        contacts=sum(1 for c in visits_by_doctor.values() if c > 0),
        targeted_visited=visited_targets,
        f1_ok=f1_ok,
        f2_ok=f2_ok,
        avg_visits_per_day=round(calls / worked, 2) if worked else 0.0,
        coverage_pct=_pct(visited_targets, len(targeted)),
        cpa_pct=_pct(f1_ok + f2_ok, len(targeted)),
        cpa_f1_pct=_pct(f1_ok, len(f1)),
        cpa_f2_pct=_pct(f2_ok, len(f2)),
    )


def _raw_counts(db: Session, delegue_ids: list[int], first: date, last: date):
    """Fréquence de chaque médecin et nombre de visites réalisées par médecin sur la période."""
    frequencies = {
        doctor_id: (delegue_id, freq)
        for doctor_id, delegue_id, freq in db.execute(
            select(Doctor.id, Doctor.delegue_id, Doctor.frequency).where(Doctor.delegue_id.in_(delegue_ids))
        )
    }
    visits = Counter(
        dict(
            db.execute(
                select(Visit.doctor_id, func.count())
                .where(
                    Visit.delegue_id.in_(delegue_ids),
                    Visit.status == VisitStatus.REALISEE,
                    Visit.actual_at >= datetime.combine(first, datetime.min.time()),
                    Visit.actual_at < datetime.combine(last + timedelta(days=1), datetime.min.time()),
                )
                .group_by(Visit.doctor_id)
            ).all()
        )
    )
    return frequencies, visits


def activity_rows(db: Session, delegues: list[User], period: str) -> tuple[list[ActivityRow], ActivityRow, Counter]:
    """Lignes par délégué + ligne « Équipe » + jours d'événements par type (toute l'équipe)."""
    first, last = period_range(period)
    ids = [d.id for d in delegues]
    days = period_days(first, last)
    frequencies, visits = _raw_counts(db, ids, first, last)
    events_by_type: Counter = Counter()
    rows = []
    for d in delegues:
        events = event_days_by_type(db, [d.id], first, last)
        events_by_type.update(events)
        mine = {doc: f for doc, (owner, f) in frequencies.items() if owner == d.id}
        rows.append(_row(d.name, d.region, d.id, days, sum(events.values()), mine,
                         Counter({doc: visits[doc] for doc in mine})))
    total = _row("Équipe", "Toutes régions", None, days * len(delegues), sum(events_by_type.values()),
                 {doc: f for doc, (_, f) in frequencies.items()}, visits)
    return rows, total, events_by_type


def delegue_activity(db: Session, delegue: User, period: str | None = None) -> ActivityRow:
    """Indicateurs d'un délégué (mois en cours par défaut) — utilisé par le tableau de bord."""
    rows, _, _ = activity_rows(db, [delegue], period or period_of(now().date()))
    return rows[0]


def available_periods() -> list[str]:
    return list(reversed(previous_periods(period_of(now().date()), HISTORY_MONTHS)))


def activity_overview(db: Session, user: User, period: str | None = None,
                      delegue_id: int | None = None) -> ActivityOut:
    """Tableau d'activité : un délégué voit sa ligne ; un superviseur voit son équipe (ou un délégué)."""
    periods = available_periods()
    period = period or periods[0]
    if period not in periods:
        raise HTTPException(400, "Mois non disponible")
    ids = access.resolve_delegue_ids(db, user, delegue_id)
    delegues = list(db.scalars(select(User).where(User.id.in_(ids)).order_by(User.name)))
    rows, total, events_by_type = activity_rows(db, delegues, period)

    terrain = total.worked_days
    breakdown = [EventBreakdown(key="terrain", days=terrain)] + [
        EventBreakdown(key=t.value, days=events_by_type[t.value]) for t in EventType if events_by_type[t.value]
    ]
    trend = []
    for p in reversed(periods):
        _, t, _ = activity_rows(db, delegues, p)
        trend.append(ActivityTrendPoint(period=p, label=period_label(p), avg_visits_per_day=t.avg_visits_per_day,
                                        coverage_pct=t.coverage_pct, cpa_pct=t.cpa_pct))
    first, last = period_range(period)
    return ActivityOut(
        period=period,
        period_label=period_label(period),
        is_current=period == periods[0],
        through=last,
        rows=rows,
        total=total if user.role == Role.SUPERVISEUR and len(rows) > 1 else None,
        breakdown=breakdown,
        trend=trend,
        periods=periods,
    )


# ---------------------------------------------------------------------------
# Événements d'agenda
# ---------------------------------------------------------------------------

def _event_out(e: Event, names: dict[int, str]) -> EventOut:
    return EventOut(id=e.id, delegue_id=e.delegue_id, delegue_name=names.get(e.delegue_id, ""), day=e.day,
                    type=e.type, duration_days=e.duration_days, half=e.half, comment=e.comment)


def list_events(db: Session, user: User, start: date, end: date, delegue_id: int | None = None) -> list[EventOut]:
    """Événements entre `start` et `end` inclus (pour le planning)."""
    ids = access.resolve_delegue_ids(db, user, delegue_id)
    names = dict(db.execute(select(User.id, User.name).where(User.id.in_(ids))).all())
    events = db.scalars(
        select(Event).where(Event.delegue_id.in_(ids), Event.day >= start, Event.day <= end).order_by(Event.day)
    )
    return [_event_out(e, names) for e in events]


def create_event(db: Session, user: User, data: EventCreate) -> EventOut:
    if user.role == Role.DELEGUE:
        delegue_id = user.id
    else:
        if data.delegue_id is None:
            raise HTTPException(400, "Choisissez le délégué concerné")
        access.check_delegue_access(db, user, data.delegue_id)
        delegue_id = data.delegue_id
    if data.type not in {t.value for t in EventType}:
        raise HTTPException(400, f"Type d'événement inconnu : {data.type}")
    if data.half not in (None, "matin", "apres_midi"):
        raise HTTPException(400, "Demi-journée invalide")
    if data.day.weekday() == 6:
        raise HTTPException(400, "Le dimanche n'est pas un jour travaillé")
    if db.scalar(select(Event.id).where(Event.delegue_id == delegue_id, Event.day == data.day)):
        raise HTTPException(400, "Un événement est déjà prévu ce jour-là")
    saturday = data.day.weekday() == 5
    event = Event(
        delegue_id=delegue_id,
        day=data.day,
        type=data.type,
        duration_days=0.5 if data.half or saturday else 1.0,
        half=None if saturday else data.half,
        comment=data.comment,
        created_at=now(),
    )
    db.add(event)
    db.commit()
    return _event_out(event, {delegue_id: db.get(User, delegue_id).name})


def delete_event(db: Session, user: User, event_id: int) -> None:
    event = db.get(Event, event_id)
    if event is None:
        raise HTTPException(404, "Événement introuvable")
    access.check_delegue_access(db, user, event.delegue_id)
    db.delete(event)
    db.commit()
