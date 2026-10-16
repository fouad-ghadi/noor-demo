"""Schémas des médecins."""
from datetime import date, datetime

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel
from app.schemas.visit import VisitOut


class PrescriptionOut(BaseModel):
    product_id: int
    brand_name: str
    molecule: str
    status: str   # non_prescripteur / occasionnel / regulier


class PrescriptionIn(BaseModel):
    product_id: int
    status: str


class DoctorBase(BaseModel):
    """Champs modifiables d'une fiche médecin (formulaire de création / édition)."""
    first_name: str = Field(min_length=1)
    last_name: str = Field(min_length=1)
    specialty: str
    practice_type: str = "cabinet"
    address: str
    city: str
    district: str
    phone: str | None = None
    email: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    segment: str = "B"
    preferred_slot: str | None = None
    notes: str | None = None


class DoctorCreate(DoctorBase):
    # Pour un superviseur : à quel délégué affecter le médecin (sinon : l'utilisateur courant)
    delegue_id: int | None = None
    source: str = "manuel"
    prescriptions: list[PrescriptionIn] = []


class DoctorUpdate(DoctorBase):
    prescriptions: list[PrescriptionIn] | None = None


class DoctorOut(ORMModel, DoctorBase):
    id: int
    delegue_id: int
    source: str
    created_at: datetime


class DoctorListItem(DoctorOut):
    """Ligne de la liste des médecins, enrichie pour les filtres et l'affichage."""
    delegue_name: str
    last_visit_date: date | None
    days_since_last_visit: int | None
    next_visit_at: datetime | None
    visits_count: int
    regular_products: list[str]   # produits prescrits régulièrement (noms)


class SlotStat(BaseModel):
    """Réceptivité du médecin selon le créneau (part de visites à retour favorable)."""
    slot: str
    visits: int
    favorable_rate: float


class DoctorDetail(DoctorOut):
    delegue_name: str
    prescriptions: list[PrescriptionOut]
    visits: list[VisitOut]                 # historique complet, du plus récent au plus ancien
    next_visit: VisitOut | None
    last_visit_date: date | None
    days_since_last_visit: int | None
    visits_count: int
    slot_stats: list[SlotStat]
