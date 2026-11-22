"""Routes de la pharmacovigilance : cas à déclarer sous 24 h, déclaration pré-remplie."""
from fastapi import APIRouter

from app.api.deps import DB, CurrentUser
from app.schemas.pharmacovigilance import PvCaseOut, PvDeclarationDraft, PvDeclarationIn
from app.services import pharmacovigilance_service as pv

router = APIRouter(prefix="/pharmacovigilance", tags=["Pharmacovigilance"])


@router.get("/cases", response_model=list[PvCaseOut])
def list_cases(db: DB, user: CurrentUser, delegue_id: int | None = None, status: str | None = None):
    """Cas visibles par l'utilisateur : à déclarer d'abord (échéance la plus proche), puis déclarés."""
    return pv.list_cases(db, user, delegue_id=delegue_id, status=status)


@router.get("/cases/{case_id}", response_model=PvCaseOut)
def get_case(case_id: int, db: DB, user: CurrentUser):
    """Un cas : 4 informations minimales, délai de 24 h, déclaration pré-remplie."""
    return pv.to_out(pv.get_case_or_403(db, user, case_id))


@router.post("/cases/{case_id}/preview", response_model=PvDeclarationDraft)
def preview_declaration(case_id: int, data: PvDeclarationIn, db: DB, user: CurrentUser):
    """Aperçu de la déclaration avec les compléments saisis par le délégué (ne modifie rien)."""
    return pv.preview(db, user, case_id, data)


@router.post("/cases/{case_id}/declare", response_model=PvCaseOut)
def declare_case(case_id: int, data: PvDeclarationIn, db: DB, user: CurrentUser):
    """« Marquer comme déclarée » : enregistre la déclaration envoyée et clôt l'alerte."""
    return pv.declare(db, user, case_id, data)
