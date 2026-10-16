"""Routes des alertes."""
from fastapi import APIRouter

from app.api.deps import DB, CurrentUser
from app.schemas.alert import AlertOut, AlertUpdate
from app.services import alert_service

router = APIRouter(prefix="/alerts", tags=["Alertes"])


@router.get("", response_model=list[AlertOut])
def list_alerts(db: DB, user: CurrentUser, delegue_id: int | None = None, include_resolved: bool = False):
    return alert_service.list_alerts(db, user, delegue_id=delegue_id, include_resolved=include_resolved)


@router.patch("/{alert_id}", response_model=AlertOut)
def update_alert(alert_id: int, data: AlertUpdate, db: DB, user: CurrentUser):
    """Marquer une alerte comme vue / traitée."""
    return alert_service.update_alert_status(db, user, alert_id, data.status)
