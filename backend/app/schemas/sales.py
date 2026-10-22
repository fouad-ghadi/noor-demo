"""Schémas de l'analyse des ventes (marché type IMS)."""
from pydantic import BaseModel


class SalesMetrics(BaseModel):
    """Indicateurs d'un périmètre (national, équipe, délégué ou territoire). Pourcentages sur 100."""
    value: float                 # ventes du (des) produit(s), en dirhams
    value_prev: float            # mêmes mois de l'année précédente
    market_value: float          # ventes du marché (produit + concurrents)
    market_value_prev: float
    qp: float | None             # quota produit = ventes locales / ventes nationales du produit
    qm: float | None             # quota marché = ventes locales / ventes nationales du marché
    pm: float | None             # part de marché = ventes du produit / ventes du marché
    pm_prev: float | None
    ie: float | None             # indice d'évolution = PM période n / PM période n-1 × 100
    ip: float | None             # indice de pénétration = PM locale / PM nationale × 100
    evol: float | None           # évolution des ventes (%) par rapport à n-1
    evol_market: float | None    # évolution du marché (%)


class TerritorySales(SalesMetrics):
    territory: str


class DelegateSales(SalesMetrics):
    delegue_id: int
    name: str
    region: str
    territories: list[TerritorySales]


class CompetitorSales(BaseModel):
    name: str
    laboratory: str
    market_name: str
    is_ours: bool
    value: float
    pm: float | None
    evol: float | None
    ie: float | None


class MonthSales(BaseModel):
    period: str
    label: str
    value: float
    market_value: float
    pm: float | None


class ProductChoice(BaseModel):
    id: int
    name: str
    market_name: str


class SalesOut(BaseModel):
    product_id: int | None       # None = tout le portefeuille
    product_name: str
    market_name: str
    period: str                  # "ytd" ou un mois « 2026-09 »
    period_label: str            # ex. « Cumul janvier → septembre 2026 »
    compare_label: str           # ex. « janvier → septembre 2025 »
    last_month: str              # dernier mois de données disponible (décalage d'un mois)
    national: SalesMetrics
    scope_label: str             # « Équipe » ou nom du délégué
    scope: SalesMetrics
    delegates: list[DelegateSales]
    competitors: list[CompetitorSales]   # sur le périmètre affiché
    monthly: list[MonthSales]             # 12 derniers mois, périmètre affiché
    months: list[str]                     # mois sélectionnables (du plus récent au plus ancien)
    products: list[ProductChoice]
