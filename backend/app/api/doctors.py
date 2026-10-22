"""Routes des médecins."""
from fastapi import APIRouter

from app.api.deps import DB, CurrentUser
from app.schemas.doctor import DoctorCreate, DoctorDetail, DoctorListItem, DoctorOut, DoctorUpdate
from app.services import doctor_service

router = APIRouter(prefix="/doctors", tags=["Médecins"])


@router.get("", response_model=list[DoctorListItem])
def list_doctors(
    db: DB,
    user: CurrentUser,
    search: str | None = None,
    city: str | None = None,
    specialty: str | None = None,
    segment: str | None = None,
    frequency: str | None = None,
    territory: str | None = None,
    product_id: int | None = None,
    prescribing_status: str | None = None,
    last_visit: str | None = None,
    delegue_id: int | None = None,
):
    """
    Liste filtrée des médecins visibles.
    `last_visit` : `lt30` (< 30 j), `gt30` (≥ 30 j ou jamais), `30_60`, `gt60` (> 60 j ou jamais), `never`.
    `frequency` : `F1`, `F2`, `cible` (F1 ou F2) ou `hors_cible`.
    """
    return doctor_service.list_doctors(
        db, user, search=search, city=city, specialty=specialty, segment=segment,
        frequency=frequency, territory=territory, product_id=product_id, prescribing_status=prescribing_status,
        last_visit=last_visit, delegue_id=delegue_id,
    )


@router.get("/{doctor_id}", response_model=DoctorDetail)
def get_doctor(doctor_id: int, db: DB, user: CurrentUser):
    """Fiche complète : infos, statut de prescription par produit, historique des visites."""
    return doctor_service.get_doctor_detail(db, user, doctor_id)


@router.post("", response_model=DoctorOut, status_code=201)
def create_doctor(data: DoctorCreate, db: DB, user: CurrentUser):
    return doctor_service.create_doctor(db, user, data)


@router.put("/{doctor_id}", response_model=DoctorOut)
def update_doctor(doctor_id: int, data: DoctorUpdate, db: DB, user: CurrentUser):
    return doctor_service.update_doctor(db, user, doctor_id, data)
