"""Schémas des alertes."""
from datetime import datetime

from pydantic import BaseModel


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


class AlertUpdate(BaseModel):
    status: str   # nouvelle / vue / traitee
