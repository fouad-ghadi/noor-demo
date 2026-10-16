"""Médecin visité par les délégués, et son statut de prescription par produit."""
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Doctor(Base):
    __tablename__ = "doctors"

    id: Mapped[int] = mapped_column(primary_key=True)
    first_name: Mapped[str] = mapped_column(String(80))
    last_name: Mapped[str] = mapped_column(String(80), index=True)
    specialty: Mapped[str] = mapped_column(String(60), index=True)
    practice_type: Mapped[str] = mapped_column(String(30))      # enums.PracticeType
    address: Mapped[str] = mapped_column(String(200))
    city: Mapped[str] = mapped_column(String(60), index=True)
    district: Mapped[str] = mapped_column(String(80))           # quartier
    phone: Mapped[str | None] = mapped_column(String(30))
    email: Mapped[str | None] = mapped_column(String(160))
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    segment: Mapped[str] = mapped_column(String(1), index=True)  # enums.Segment (A/B/C)
    preferred_slot: Mapped[str | None] = mapped_column(String(20))  # enums.TimeSlot
    notes: Mapped[str | None] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(30), default="manuel")  # enums.DoctorSource
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    # Délégué responsable de ce médecin (son « portefeuille »)
    delegue_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)

    delegue: Mapped["User"] = relationship()  # noqa: F821
    prescriptions: Mapped[list["DoctorProductStatus"]] = relationship(
        back_populates="doctor", cascade="all, delete-orphan"
    )
    visits: Mapped[list["Visit"]] = relationship(back_populates="doctor")  # noqa: F821

    @property
    def full_name(self) -> str:
        return f"Dr {self.first_name} {self.last_name}"


class DoctorProductStatus(Base):
    """
    Statut de prescription d'un médecin pour un produit donné.
    Ex. : Dr Bennani est « prescripteur régulier » de Cardiovex.
    """
    __tablename__ = "doctor_product_status"
    __table_args__ = (UniqueConstraint("doctor_id", "product_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    doctor_id: Mapped[int] = mapped_column(ForeignKey("doctors.id"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    status: Mapped[str] = mapped_column(String(30))  # enums.PrescribingStatus

    doctor: Mapped[Doctor] = relationship(back_populates="prescriptions")
    product: Mapped["Product"] = relationship()  # noqa: F821
