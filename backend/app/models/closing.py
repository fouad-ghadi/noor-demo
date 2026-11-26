"""Clôture de journée validée par le délégué (« Clôturer ma journée »)."""
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class DayClosing(Base):
    """Le bilan de la journée, tel que le délégué l'a relu, corrigé et validé (un par jour)."""
    __tablename__ = "day_closings"
    __table_args__ = (UniqueConstraint("delegue_id", "day"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    delegue_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    day: Mapped[date] = mapped_column(Date)
    report: Mapped[str] = mapped_column(Text)          # texte final, modifié par le délégué
    validated_at: Mapped[datetime] = mapped_column(DateTime)
