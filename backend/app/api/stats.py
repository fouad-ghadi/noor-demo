"""Statistiques des tableaux de bord (tout est calculé côté serveur)."""
from fastapi import APIRouter

from app.api.deps import DB, CurrentUser
from app.schemas.stats import DashboardOut, TeamOut
from app.services import stats_service

router = APIRouter(prefix="/stats", tags=["Statistiques"])


@router.get("/dashboard", response_model=DashboardOut)
def dashboard(db: DB, user: CurrentUser, delegue_id: int | None = None):
    """Tableau de bord d'un délégué (le sien, ou celui d'un membre de l'équipe pour un superviseur)."""
    return stats_service.delegue_dashboard(db, user, delegue_id)


@router.get("/team", response_model=TeamOut)
def team(db: DB, user: CurrentUser):
    """Comparaison des délégués de l'équipe (superviseur uniquement)."""
    return stats_service.team_overview(db, user)
