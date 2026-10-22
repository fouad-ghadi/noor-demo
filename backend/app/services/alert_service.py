"""
Alertes « règles métier » (sans IA) :

1. medecin_non_visite    : médecin ciblé F2 non visité depuis 30 j (ou F1 depuis 45 j)
                           et sans visite déjà planifiée → à revoir en priorité
2. compte_rendu_en_retard: visite passée depuis plus de 48 h sans compte-rendu
3. objectif_en_retard    : le délégué est sous 85 % de l'objectif attendu à date

`refresh_alerts` recalcule ces alertes : les nouvelles sont créées, celles qui
ne sont plus d'actualité passent automatiquement en « traitée ». Une alerte que
l'utilisateur a marquée « traitée » n'est pas recréée tant que la situation
ne change pas (ex. : pour un médecin non visité, l'alerte est liée à sa
dernière visite ; une nouvelle visite puis un nouveau retard = nouvelle alerte).
Les alertes de pharmacovigilance (module IA app/ai/pharmacovigilance.py) ne sont jamais touchées ici.
"""
from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import Alert, Doctor, User, Visit
from app.models.enums import AlertSeverity, AlertStatus, AlertType, Frequency, VisitStatus
from app.schemas.alert import AlertOut
from app.services import access
from app.services.dates import now, period_label, period_of

# Seuils (en jours) au-delà desquels un médecin ciblé est considéré « non visité » :
# environ un cycle de visite manqué (F2 = 2 visites par mois, F1 = 1 visite par mois)
NOT_VISITED_THRESHOLD = {Frequency.F2: 30, Frequency.F1: 45}
LATE_REPORT_HOURS = 48

RULE_TYPES = (
    AlertType.MEDECIN_NON_VISITE,
    AlertType.COMPTE_RENDU_EN_RETARD,
    AlertType.OBJECTIF_EN_RETARD,
)


def _alert_key(type_: str, doctor_id: int | None, visit_id: int | None, title: str) -> tuple:
    """Identifie une alerte « métier » de façon unique pour éviter les doublons."""
    if type_ == AlertType.OBJECTIF_EN_RETARD:
        return (type_, title)  # une seule par mois (le titre contient le mois)
    return (type_, doctor_id, visit_id)


def _desired_alerts(db: Session, delegue_id: int) -> list[Alert]:
    """Calcule les alertes qui DEVRAIENT exister maintenant pour ce délégué."""
    # Import local pour éviter une importation circulaire avec doctor_service
    from app.services.doctor_service import last_visit_dates, next_planned_visits
    from app.services.objective_service import get_progress

    current = now()
    alerts: list[Alert] = []

    # 1. Médecins ciblés non visités
    doctors = list(
        db.scalars(select(Doctor).where(Doctor.delegue_id == delegue_id, Doctor.frequency.isnot(None)))
    )
    ids = [d.id for d in doctors]
    last = last_visit_dates(db, ids)
    planned = next_planned_visits(db, ids)
    # Id de la dernière visite réalisée : sert de « référence » à l'alerte
    last_visit_id = {
        doctor_id: visit_id
        for doctor_id, visit_id in db.execute(
            select(Visit.doctor_id, Visit.id)
            .where(Visit.doctor_id.in_(ids), Visit.status == VisitStatus.REALISEE)
            .order_by(Visit.actual_at)
        )
    }
    for d in doctors:
        threshold = NOT_VISITED_THRESHOLD[Frequency(d.frequency)]
        last_dt = last.get(d.id)
        days = (current - last_dt).days if last_dt else None
        if d.id in planned or (days is not None and days < threshold):
            continue
        since = f"depuis {days} jours" if days is not None else "jamais visité"
        alerts.append(
            Alert(
                type=AlertType.MEDECIN_NON_VISITE,
                severity=AlertSeverity.HAUTE if d.frequency == Frequency.F2 else AlertSeverity.MOYENNE,
                title=f"{d.full_name} non visité {since}",
                message=f"Médecin ciblé {d.frequency}, potentiel {d.segment} ({d.specialty}, {d.district}). "
                        f"Planifiez une visite rapidement.",
                delegue_id=delegue_id,
                doctor_id=d.id,
                visit_id=last_visit_id.get(d.id),
                created_at=(last_dt + timedelta(days=threshold)) if last_dt else current - timedelta(days=3),
            )
        )

    # 2. Comptes-rendus en retard
    late_visits = db.scalars(
        select(Visit)
        .where(
            Visit.delegue_id == delegue_id,
            Visit.status == VisitStatus.PLANIFIEE,
            Visit.planned_at < current - timedelta(hours=LATE_REPORT_HOURS),
        )
        .options(selectinload(Visit.doctor))
    )
    for v in late_visits:
        alerts.append(
            Alert(
                type=AlertType.COMPTE_RENDU_EN_RETARD,
                severity=AlertSeverity.MOYENNE,
                title=f"Compte-rendu en attente : {v.doctor.full_name}",
                message=f"Visite du {v.planned_at:%d/%m/%Y à %H:%M} sans compte-rendu.",
                delegue_id=delegue_id,
                doctor_id=v.doctor_id,
                visit_id=v.id,
                created_at=v.planned_at + timedelta(hours=LATE_REPORT_HOURS),
            )
        )

    # 3. Objectif du mois en retard (à partir du 3e jour ouvré, pour éviter le bruit)
    period = period_of(current)
    progress = get_progress(db, delegue_id, period)
    if progress and progress.expected_pct >= 10:
        ratio = progress.visits_pct / progress.expected_pct
        if ratio < 0.85:
            alerts.append(
                Alert(
                    type=AlertType.OBJECTIF_EN_RETARD,
                    severity=AlertSeverity.HAUTE if ratio < 0.7 else AlertSeverity.MOYENNE,
                    title=f"Objectif de visites en retard — {period_label(period)}",
                    message=f"{progress.done_visits} visites réalisées sur {progress.target_visits} "
                            f"({progress.visits_pct:.0f} %), alors que {progress.expected_pct:.0f} % "
                            f"étaient attendus à date.",
                    delegue_id=delegue_id,
                    created_at=current.replace(hour=8, minute=0, second=0),
                )
            )
    return alerts


def refresh_alerts(db: Session, delegue_id: int) -> None:
    """Synchronise les alertes « métier » en base avec la situation actuelle."""
    desired = {_alert_key(a.type, a.doctor_id, a.visit_id, a.title): a for a in _desired_alerts(db, delegue_id)}
    existing = db.scalars(
        select(Alert).where(Alert.delegue_id == delegue_id, Alert.type.in_(RULE_TYPES))
    )
    for alert in existing:
        key = _alert_key(alert.type, alert.doctor_id, alert.visit_id, alert.title)
        if key in desired:
            fresh = desired.pop(key)
            if alert.status != AlertStatus.TRAITEE:  # on met à jour le texte (nb de jours...)
                alert.severity, alert.title, alert.message = fresh.severity, fresh.title, fresh.message
        elif alert.status != AlertStatus.TRAITEE:
            alert.status = AlertStatus.TRAITEE  # plus d'actualité : résolue automatiquement
    db.add_all(desired.values())
    db.commit()


_SEVERITY_ORDER = {AlertSeverity.HAUTE: 0, AlertSeverity.MOYENNE: 1, AlertSeverity.FAIBLE: 2}


def to_out(alert: Alert) -> AlertOut:
    return AlertOut(
        id=alert.id,
        type=alert.type,
        severity=alert.severity,
        status=alert.status,
        title=alert.title,
        message=alert.message,
        delegue_id=alert.delegue_id,
        doctor_id=alert.doctor_id,
        doctor_name=alert.doctor.full_name if alert.doctor else None,
        visit_id=alert.visit_id,
        created_at=alert.created_at,
    )


def list_alerts(
    db: Session,
    user: User,
    *,
    delegue_id: int | None = None,
    include_resolved: bool = False,
    limit: int | None = None,
) -> list[AlertOut]:
    """
    Alertes ouvertes : pharmacovigilance d'abord (obligation légale de déclaration),
    puis par gravité, puis de la plus récente à la plus ancienne.
    """
    delegue_ids = access.resolve_delegue_ids(db, user, delegue_id)
    q = (
        select(Alert)
        .where(Alert.delegue_id.in_(delegue_ids))
        .options(selectinload(Alert.doctor))
    )
    if not include_resolved:
        q = q.where(Alert.status != AlertStatus.TRAITEE)
    alerts = sorted(
        db.scalars(q),
        key=lambda a: (
            a.type != AlertType.PHARMACOVIGILANCE,
            _SEVERITY_ORDER.get(a.severity, 3),
            -a.created_at.timestamp(),
        ),
    )
    return [to_out(a) for a in (alerts[:limit] if limit else alerts)]


def update_alert_status(db: Session, user: User, alert_id: int, status: str) -> AlertOut:
    alert = db.get(Alert, alert_id)
    if alert is None:
        raise HTTPException(404, "Alerte introuvable")
    access.check_delegue_access(db, user, alert.delegue_id)
    if status not in {s.value for s in AlertStatus}:
        raise HTTPException(400, f"Statut invalide : {status}")
    alert.status = status
    db.commit()
    return to_out(alert)
