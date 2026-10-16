"""
Visite d'un délégué chez un médecin, et son compte-rendu.

Cycle de vie d'une visite :
    planifiee ──(compte-rendu saisi)──► realisee
        │
        ├──► annulee   (médecin absent, annulation...)
        └──► reportee  (une nouvelle visite est replanifiée)

Une visite « planifiee » dont la date est passée = compte-rendu en attente.
"""
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Visit(Base):
    __tablename__ = "visits"

    id: Mapped[int] = mapped_column(primary_key=True)
    delegue_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    doctor_id: Mapped[int] = mapped_column(ForeignKey("doctors.id"), index=True)

    planned_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    actual_at: Mapped[datetime | None] = mapped_column(DateTime)
    status: Mapped[str] = mapped_column(String(20), default="planifiee", index=True)

    # --- Compte-rendu (rempli quand la visite est réalisée) ---
    duration_min: Mapped[int | None] = mapped_column(Integer)
    feedback: Mapped[str | None] = mapped_column(String(30))      # enums.VisitFeedback
    notes: Mapped[str | None] = mapped_column(Text)               # texte libre
    next_step: Mapped[str | None] = mapped_column(String(300))
    next_visit_date: Mapped[date | None] = mapped_column(Date)
    cancel_reason: Mapped[str | None] = mapped_column(String(200))
    report_source: Mapped[str | None] = mapped_column(String(20))  # enums.ReportSource
    reported_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    delegue: Mapped["User"] = relationship()  # noqa: F821
    doctor: Mapped["Doctor"] = relationship(back_populates="visits")  # noqa: F821
    products: Mapped[list["VisitProduct"]] = relationship(cascade="all, delete-orphan")
    samples: Mapped[list["VisitSample"]] = relationship(cascade="all, delete-orphan")
    objections: Mapped[list["VisitObjection"]] = relationship(cascade="all, delete-orphan")


class VisitProduct(Base):
    """Produit présenté pendant une visite."""
    __tablename__ = "visit_products"

    id: Mapped[int] = mapped_column(primary_key=True)
    visit_id: Mapped[int] = mapped_column(ForeignKey("visits.id"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)

    product: Mapped["Product"] = relationship()  # noqa: F821


class VisitSample(Base):
    """Échantillons remis au médecin (produit + quantité)."""
    __tablename__ = "visit_samples"

    id: Mapped[int] = mapped_column(primary_key=True)
    visit_id: Mapped[int] = mapped_column(ForeignKey("visits.id"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    quantity: Mapped[int] = mapped_column(Integer)

    product: Mapped["Product"] = relationship()  # noqa: F821


class VisitObjection(Base):
    """Objection soulevée par le médecin : catégorie normalisée + commentaire libre."""
    __tablename__ = "visit_objections"

    id: Mapped[int] = mapped_column(primary_key=True)
    visit_id: Mapped[int] = mapped_column(ForeignKey("visits.id"), index=True)
    category: Mapped[str] = mapped_column(String(40))   # clé de enums.OBJECTION_CATEGORIES
    comment: Mapped[str | None] = mapped_column(String(300))
    product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id"))

    product: Mapped["Product | None"] = relationship()  # noqa: F821
