"""Schémas des alertes."""
from datetime import datetime

from pydantic import BaseModel

from app.schemas.pharmacovigilance import PvCaseSummary


class AlertOut(BaseModel):
    id: int
    type: str
    severity: str
    status: str
    title: str
    message: str | None
    delegue_id: int
    doctor_id: int | None
    doctor_name: str | None
    visit_id: int | None
    created_at: datetime
    # Alertes « pharmacovigilance » : délai de 24 h et informations manquantes
    pv_case: PvCaseSummary | None = None


class AlertUpdate(BaseModel):
    status: str   # nouvelle / vue / traitee
