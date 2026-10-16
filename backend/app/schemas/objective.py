"""Schémas des objectifs et de leur avancement."""
from pydantic import BaseModel


class ProductObjectiveProgress(BaseModel):
    product_id: int
    brand_name: str
    target: int
    done: int
    pct: float


class ObjectiveProgress(BaseModel):
    delegue_id: int
    period: str                 # "2026-10"
    label: str                  # "octobre 2026"
    is_current: bool
    # Visites
    target_visits: int
    done_visits: int
    visits_pct: float           # réalisé / objectif (en %)
    expected_pct: float         # % attendu à date (prorata des jours ouvrés écoulés)
    # Couverture des médecins A
    target_coverage_a: int
    coverage_a: float           # % de médecins A visités au moins une fois dans le mois
    a_doctors_total: int
    a_doctors_visited: int
    # Par produit
    products: list[ProductObjectiveProgress]
    # "en_avance" / "dans_les_temps" / "en_retard"
    status: str
