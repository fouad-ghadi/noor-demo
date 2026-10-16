"""Listes de référence pour les formulaires et filtres (spécialités, villes, objections...)."""
from fastapi import APIRouter
from sqlalchemy import select

from app.api.deps import DB, CurrentUser
from app.models import Doctor
from app.models.enums import OBJECTION_CATEGORIES, SPECIALTIES
from app.seed_data.geography import REGIONS
from app.services import access

router = APIRouter(tags=["Référentiels"])


@router.get("/meta")
def get_meta(db: DB, user: CurrentUser):
    """
    - `specialties` : spécialités médicales
    - `cities` : villes où l'utilisateur a des médecins
    - `districts` : quartiers connus par ville, avec coordonnées GPS approximatives
      (le formulaire médecin s'en sert pour placer le cabinet sur la carte)
    - `objection_categories` : catégories d'objections {code: libellé}
    """
    delegue_ids = access.visible_delegue_ids(db, user)
    cities = sorted(set(db.scalars(select(Doctor.city).where(Doctor.delegue_id.in_(delegue_ids)))))
    districts: dict[str, list[dict]] = {}
    for places in REGIONS.values():
        for city, district, lat, lon, _ in places:
            districts.setdefault(city, []).append({"name": district, "latitude": lat, "longitude": lon})
    return {
        "specialties": SPECIALTIES,
        "cities": cities,
        "districts": districts,
        "objection_categories": OBJECTION_CATEGORIES,
    }
