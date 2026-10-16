"""Routes des objectifs."""
from fastapi import APIRouter

from app.api.deps import DB, CurrentUser
from app.schemas.objective import ObjectiveProgress
from app.services import objective_service

router = APIRouter(prefix="/objectives", tags=["Objectifs"])


@router.get("", response_model=list[ObjectiveProgress])
def list_objectives(db: DB, user: CurrentUser, delegue_id: int | None = None):
    """Objectifs mensuels avec avancement, du mois en cours au plus ancien."""
    return objective_service.list_progress(db, user, delegue_id)
