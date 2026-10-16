"""Routes des visites et comptes-rendus."""
from datetime import datetime

from fastapi import APIRouter

from app.api.deps import DB, CurrentUser
from app.schemas.visit import VisitCancel, VisitCreate, VisitOut, VisitReport, VisitReschedule
from app.services import visit_service

router = APIRouter(prefix="/visits", tags=["Visites"])


@router.get("", response_model=list[VisitOut])
def list_visits(
    db: DB,
    user: CurrentUser,
    start: datetime | None = None,
    end: datetime | None = None,
    status: str | None = None,
    doctor_id: int | None = None,
    delegue_id: int | None = None,
    pending_report: bool = False,
):
    """Visites sur une période (ex. la semaine affichée dans le planning)."""
    visits = visit_service.list_visits(
        db, user, start=start, end=end, status=status, doctor_id=doctor_id,
        delegue_id=delegue_id, pending_report=pending_report,
    )
    return [VisitOut.from_model(v) for v in visits]


@router.get("/{visit_id}", response_model=VisitOut)
def get_visit(visit_id: int, db: DB, user: CurrentUser):
    return VisitOut.from_model(visit_service.get_visit(db, user, visit_id))


@router.post("", response_model=VisitOut, status_code=201)
def plan_visit(data: VisitCreate, db: DB, user: CurrentUser):
    """Planifier une nouvelle visite."""
    return VisitOut.from_model(visit_service.plan_visit(db, user, data))


@router.patch("/{visit_id}/reschedule", response_model=VisitOut)
def reschedule_visit(visit_id: int, data: VisitReschedule, db: DB, user: CurrentUser):
    """Déplacer une visite planifiée."""
    return VisitOut.from_model(visit_service.reschedule_visit(db, user, visit_id, data))


@router.post("/{visit_id}/cancel", response_model=VisitOut)
def cancel_visit(visit_id: int, data: VisitCancel, db: DB, user: CurrentUser):
    """Annuler (ou reporter avec `postpone=true`) une visite planifiée."""
    return VisitOut.from_model(visit_service.cancel_visit(db, user, visit_id, data))


@router.put("/{visit_id}/report", response_model=VisitOut)
def submit_report(visit_id: int, data: VisitReport, db: DB, user: CurrentUser):
    """Enregistrer le compte-rendu : la visite passe en « réalisée »."""
    return VisitOut.from_model(visit_service.submit_report(db, user, visit_id, data))
