"""
Alertes affichées au délégué (et visibles par le superviseur).

Aujourd'hui elles sont produites par des règles simples
(services/alert_service.py). Plus tard, le module IA de pharmacovigilance
créera des alertes de type « pharmacovigilance » liées à une visite.
"""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(primary_key=True)
    type: Mapped[str] = mapped_column(String(40), index=True)      # enums.AlertType
    severity: Mapped[str] = mapped_column(String(20))              # enums.AlertSeverity
    status: Mapped[str] = mapped_column(String(20), default="nouvelle")  # enums.AlertStatus
    title: Mapped[str] = mapped_column(String(200))
    message: Mapped[str | None] = mapped_column(String(500))
    delegue_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    doctor_id: Mapped[int | None] = mapped_column(ForeignKey("doctors.id"))
    visit_id: Mapped[int | None] = mapped_column(ForeignKey("visits.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    doctor: Mapped["Doctor | None"] = relationship()  # noqa: F821
