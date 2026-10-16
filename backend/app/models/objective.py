"""Objectifs mensuels fixés à chaque délégué."""
from sqlalchemy import ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Objective(Base):
    __tablename__ = "objectives"
    __table_args__ = (UniqueConstraint("delegue_id", "period"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    delegue_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    period: Mapped[str] = mapped_column(String(7))           # mois au format "2026-10"
    target_visits: Mapped[int] = mapped_column(Integer)       # nb de visites réalisées
    target_coverage_a: Mapped[int] = mapped_column(Integer)   # % de médecins A visités dans le mois

    products: Mapped[list["ObjectiveProduct"]] = relationship(cascade="all, delete-orphan")


class ObjectiveProduct(Base):
    """Objectif par produit : nombre de présentations du produit dans le mois."""
    __tablename__ = "objective_products"

    id: Mapped[int] = mapped_column(primary_key=True)
    objective_id: Mapped[int] = mapped_column(ForeignKey("objectives.id"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    target_presentations: Mapped[int] = mapped_column(Integer)

    product: Mapped["Product"] = relationship()  # noqa: F821
