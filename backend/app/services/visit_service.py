"""
Logique métier des visites : planification, déplacement, annulation, compte-rendu.

`submit_report` est le point d'entrée que réutilisera l'assistant vocal
(app/ai/voice_report.py) : il produira un `VisitReport` à partir de la dictée,
puis appellera cette même fonction avec report_source="dictee".
"""
import logging
from datetime import datetime, time

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import User, Visit, VisitObjection, VisitProduct, VisitSample
from app.models.enums import OBJECTION_CATEGORIES, VisitFeedback, VisitStatus
from app.schemas.visit import VisitCancel, VisitCreate, VisitReport, VisitReschedule
from app.services import access, alert_service
from app.services.dates import now


def _load_options():
    return (
        selectinload(Visit.doctor),
        selectinload(Visit.products).selectinload(VisitProduct.product),
        selectinload(Visit.samples).selectinload(VisitSample.product),
        selectinload(Visit.objections),
    )


def list_visits(
    db: Session,
    user: User,
    *,
    start: datetime | None = None,
    end: datetime | None = None,
    status: str | None = None,
    doctor_id: int | None = None,
    delegue_id: int | None = None,
    pending_report: bool = False,
) -> list[Visit]:
    """Visites visibles par l'utilisateur, filtrées par période / statut / médecin."""
    delegue_ids = access.resolve_delegue_ids(db, user, delegue_id)
    q = (
        select(Visit)
        .where(Visit.delegue_id.in_(delegue_ids))
        .options(*_load_options())
        .order_by(Visit.planned_at)
    )
    if start:
        q = q.where(Visit.planned_at >= start)
    if end:
        q = q.where(Visit.planned_at < end)
    if status:
        q = q.where(Visit.status == status)
    if doctor_id:
        q = q.where(Visit.doctor_id == doctor_id)
    if pending_report:
        q = q.where(Visit.status == VisitStatus.PLANIFIEE, Visit.planned_at < now())
    return list(db.scalars(q))


def get_visit(db: Session, user: User, visit_id: int) -> Visit:
    access.get_visit_or_403(db, user, visit_id)
    return db.scalars(select(Visit).where(Visit.id == visit_id).options(*_load_options())).one()


def plan_visit(db: Session, user: User, data: VisitCreate) -> Visit:
    """Planifie une visite chez un médecin du portefeuille."""
    doctor = access.get_doctor_or_403(db, user, data.doctor_id)
    visit = Visit(
        delegue_id=doctor.delegue_id,
        doctor_id=doctor.id,
        planned_at=data.planned_at,
        status=VisitStatus.PLANIFIEE,
        notes=data.notes,
        created_at=now(),
    )
    db.add(visit)
    db.commit()
    alert_service.refresh_alerts(db, doctor.delegue_id)
    return get_visit(db, user, visit.id)


def _ensure_planned(visit: Visit) -> None:
    if visit.status != VisitStatus.PLANIFIEE:
        raise HTTPException(400, "Seule une visite planifiée peut être modifiée")


def reschedule_visit(db: Session, user: User, visit_id: int, data: VisitReschedule) -> Visit:
    """Déplace une visite planifiée à une autre date / heure."""
    visit = access.get_visit_or_403(db, user, visit_id)
    _ensure_planned(visit)
    visit.planned_at = data.planned_at
    db.commit()
    alert_service.refresh_alerts(db, visit.delegue_id)
    _scan_pharmacovigilance(db, visit)
    return get_visit(db, user, visit.id)


def _scan_pharmacovigilance(db: Session, visit: Visit) -> None:
    """IA : cherche un effet indésirable dans le compte-rendu et crée l'alerte de déclaration."""
    # Import local : le module IA dépend lui-même des services (évite une importation circulaire)
    from app.ai import pharmacovigilance

    try:
        pharmacovigilance.scan_visit(db, visit)
    except Exception:  # noqa: BLE001 — l'analyse ne doit jamais empêcher d'enregistrer le compte-rendu
        db.rollback()
        logging.getLogger("uvicorn.error").exception("Analyse de pharmacovigilance impossible")


def cancel_visit(db: Session, user: User, visit_id: int, data: VisitCancel) -> Visit:
    """
    Annule une visite, ou la reporte (statut « reportée » + création d'une
    nouvelle visite planifiée à la nouvelle date).
    """
    visit = access.get_visit_or_403(db, user, visit_id)
    _ensure_planned(visit)
    visit.cancel_reason = data.reason
    if data.postpone:
        if data.new_planned_at is None:
            raise HTTPException(400, "Indiquez la nouvelle date de la visite")
        visit.status = VisitStatus.REPORTEE
        db.add(
            Visit(
                delegue_id=visit.delegue_id,
                doctor_id=visit.doctor_id,
                planned_at=data.new_planned_at,
                status=VisitStatus.PLANIFIEE,
                notes=f"Visite reportée du {visit.planned_at:%d/%m/%Y} ({data.reason})",
                created_at=now(),
            )
        )
    else:
        visit.status = VisitStatus.ANNULEE
    db.commit()
    alert_service.refresh_alerts(db, visit.delegue_id)
    _scan_pharmacovigilance(db, visit)
    return get_visit(db, user, visit.id)


def _scan_pharmacovigilance(db: Session, visit: Visit) -> None:
    """IA : cherche un effet indésirable dans le compte-rendu et crée l'alerte de déclaration."""
    # Import local : le module IA dépend lui-même des services (évite une importation circulaire)
    from app.ai import pharmacovigilance

    try:
        pharmacovigilance.scan_visit(db, visit)
    except Exception:  # noqa: BLE001 — l'analyse ne doit jamais empêcher d'enregistrer le compte-rendu
        db.rollback()
        logging.getLogger("uvicorn.error").exception("Analyse de pharmacovigilance impossible")


def submit_report(db: Session, user: User, visit_id: int, data: VisitReport) -> Visit:
    """
    Enregistre le compte-rendu d'une visite et la passe en « réalisée ».
    Peut aussi planifier automatiquement la visite suivante.
    """
    visit = access.get_visit_or_403(db, user, visit_id)
    if visit.status in (VisitStatus.ANNULEE, VisitStatus.REPORTEE):
        raise HTTPException(400, "Impossible de rédiger le compte-rendu d'une visite annulée ou reportée")
    if data.feedback not in {f.value for f in VisitFeedback}:
        raise HTTPException(400, f"Retour médecin invalide : {data.feedback}")
    for o in data.objections:
        if o.category not in OBJECTION_CATEGORIES:
            raise HTTPException(400, f"Catégorie d'objection inconnue : {o.category}")

    first_report = visit.status == VisitStatus.PLANIFIEE
    visit.status = VisitStatus.REALISEE
    visit.actual_at = data.actual_at or visit.actual_at or min(visit.planned_at, now())
    visit.duration_min = data.duration_min
    visit.feedback = data.feedback
    visit.notes = data.notes
    visit.next_step = data.next_step
    visit.next_visit_date = data.next_visit_date
    visit.report_source = data.report_source
    visit.reported_at = now()

    # On remplace entièrement produits / échantillons / objections (cas d'une modification)
    visit.products = [VisitProduct(product_id=pid) for pid in dict.fromkeys(data.product_ids)]
    visit.samples = [VisitSample(product_id=s.product_id, quantity=s.quantity) for s in data.samples]
    visit.objections = [
        VisitObjection(category=o.category, comment=o.comment, product_id=o.product_id)
        for o in data.objections
    ]

    # Prochaine visite : on la crée seulement au premier enregistrement du compte-rendu,
    # et seulement s'il n'y a pas déjà une visite planifiée à venir pour ce médecin.
    if first_report and data.plan_next_visit and data.next_visit_date:
        already_planned = db.scalar(
            select(Visit.id).where(
                Visit.doctor_id == visit.doctor_id,
                Visit.status == VisitStatus.PLANIFIEE,
                Visit.planned_at >= now(),
            )
        )
        if not already_planned:
            # Heure par défaut : même heure que la visite actuelle
            hour = visit.actual_at.time() if visit.actual_at else time(10, 0)
            db.add(
                Visit(
                    delegue_id=visit.delegue_id,
                    doctor_id=visit.doctor_id,
                    planned_at=datetime.combine(data.next_visit_date, hour.replace(second=0)),
                    status=VisitStatus.PLANIFIEE,
                    notes=data.next_step,
                    created_at=now(),
                )
            )

    db.commit()
    alert_service.refresh_alerts(db, visit.delegue_id)
    _scan_pharmacovigilance(db, visit)
    return get_visit(db, user, visit.id)


def _scan_pharmacovigilance(db: Session, visit: Visit) -> None:
    """IA : cherche un effet indésirable dans le compte-rendu et crée l'alerte de déclaration."""
    # Import local : le module IA dépend lui-même des services (évite une importation circulaire)
    from app.ai import pharmacovigilance

    try:
        pharmacovigilance.scan_visit(db, visit)
    except Exception:  # noqa: BLE001 — l'analyse ne doit jamais empêcher d'enregistrer le compte-rendu
        db.rollback()
        logging.getLogger("uvicorn.error").exception("Analyse de pharmacovigilance impossible")

