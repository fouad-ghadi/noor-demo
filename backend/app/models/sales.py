"""
Ventes du marché pharmaceutique (données de type « IMS », toutes fictives).

Chaque produit du laboratoire appartient à un marché (classe thérapeutique),
où il est en concurrence avec des produits d'autres laboratoires. Les ventes sont
mensuelles, par territoire. Le module « Analyse des ventes » (services/sales_service.py)
en déduit part de marché, quotas, indices d'évolution et de pénétration.
"""
from sqlalchemy import Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class MarketProduct(Base):
    """Un produit vendu sur un marché : le nôtre (product_id renseigné) ou un concurrent."""
    __tablename__ = "market_products"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    laboratory: Mapped[str] = mapped_column(String(80))
    market_code: Mapped[str] = mapped_column(String(10), index=True)   # ex. « C10A1 »
    market_name: Mapped[str] = mapped_column(String(80))               # ex. « Statines »
    product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id"))

    product: Mapped["Product | None"] = relationship()  # noqa: F821


class SalesRecord(Base):
    """Ventes d'un produit sur un territoire pendant un mois."""
    __tablename__ = "sales_records"
    __table_args__ = (UniqueConstraint("period", "territory", "market_product_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    period: Mapped[str] = mapped_column(String(7), index=True)         # "2026-09"
    territory: Mapped[str] = mapped_column(String(60), index=True)
    market_product_id: Mapped[int] = mapped_column(ForeignKey("market_products.id"), index=True)
    units: Mapped[int] = mapped_column(Integer)
    value: Mapped[float] = mapped_column(Float)                        # chiffre d'affaires en dirhams
