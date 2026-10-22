"""Analyse des ventes : part de marché, quotas, indices d'évolution et de pénétration (marché type IMS)."""
from fastapi import APIRouter

from app.api.deps import DB, CurrentUser
from app.schemas.sales import SalesOut
from app.services import sales_service

router = APIRouter(prefix="/sales", tags=["Analyse des ventes"])


@router.get("", response_model=SalesOut)
def sales(db: DB, user: CurrentUser, product_id: int | None = None, period: str = "ytd",
          delegue_id: int | None = None):
    """
    `period` : « ytd » (cumul depuis janvier) ou un mois « 2026-09 », comparé aux mêmes mois de l'année
    précédente. Sans `product_id` : tout le portefeuille. Un délégué voit ses territoires ; un superviseur
    son équipe (ou un délégué avec `delegue_id`).
    """
    return sales_service.sales_analysis(db, user, product_id, period, delegue_id)
