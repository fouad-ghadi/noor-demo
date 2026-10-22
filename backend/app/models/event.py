"""
Événement de l'agenda hors visites : réunion, formation, congrès, congé, jour férié...

Chaque ligne couvre un jour (ou une demi-journée). Ces jours ne sont pas passés
sur le terrain : ils sont retirés des « jours travaillés » pour calculer la
moyenne de visites par jour (voir services/activity_service.py).
"""
from datetime import date, datetime

from sqlalchemy import Date, DateTime, Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Event(Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(primary_key=True)
    delegue_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    day: Mapped[date] = mapped_column(Date, index=True)
    type: Mapped[str] = mapped_column(String(30))           # enums.EventType
    # 1 = journée entière, 0.5 = demi-journée
    duration_days: Mapped[float] = mapped_column(Float, default=1.0)
    # Pour une demi-journée : "matin" ou "apres_midi" (None pour une journée entière)
    half: Mapped[str | None] = mapped_column(String(20))
    comment: Mapped[str | None] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
