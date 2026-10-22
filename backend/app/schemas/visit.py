"""Schémas des visites et des comptes-rendus."""
from datetime import date, datetime

from pydantic import BaseModel, Field

from app.models import Visit
from app.models.enums import OBJECTION_CATEGORIES, VisitStatus
from app.schemas.common import ORMModel
from app.services.dates import now


class VisitProductOut(ORMModel):
    product_id: int
    brand_name: str


class SampleIn(BaseModel):
    product_id: int
    quantity: int = Field(ge=1, le=50)
    lot_number: str | None = Field(default=None, max_length=30)


class SampleOut(SampleIn):
    brand_name: str


class ObjectionIn(BaseModel):
    category: str   # clé de OBJECTION_CATEGORIES (ex. "prix_eleve")
    comment: str | None = None
    product_id: int | None = None


class ObjectionOut(ObjectionIn):
    label: str      # libellé français de la catégorie


class VisitOut(BaseModel):
    """Une visite, avec les infos utiles du médecin pour l'affichage (agenda, carte...)."""
    id: int
    delegue_id: int
    doctor_id: int
    doctor_name: str
    doctor_specialty: str
    doctor_segment: str
    doctor_frequency: str | None
    doctor_city: str
    doctor_district: str
    doctor_address: str
    doctor_latitude: float | None
    doctor_longitude: float | None
    planned_at: datetime
    actual_at: datetime | None
    status: str
    duration_min: int | None
    feedback: str | None
    prescription_feedback: str | None
    notes: str | None
    next_step: str | None
    next_visit_date: date | None
    cancel_reason: str | None
    report_source: str | None
    reported_at: datetime | None
    products: list[VisitProductOut]
    samples: list[SampleOut]
    objections: list[ObjectionOut]
    # True si la visite est passée mais que le compte-rendu n'est pas saisi
    report_pending: bool

    @classmethod
    def from_model(cls, v: Visit) -> "VisitOut":
        d = v.doctor
        return cls(
            id=v.id,
            delegue_id=v.delegue_id,
            doctor_id=d.id,
            doctor_name=d.full_name,
            doctor_specialty=d.specialty,
            doctor_segment=d.segment,
            doctor_frequency=d.frequency,
            doctor_city=d.city,
            doctor_district=d.district,
            doctor_address=d.address,
            doctor_latitude=d.latitude,
            doctor_longitude=d.longitude,
            planned_at=v.planned_at,
            actual_at=v.actual_at,
            status=v.status,
            duration_min=v.duration_min,
            feedback=v.feedback,
            prescription_feedback=v.prescription_feedback,
            notes=v.notes,
            next_step=v.next_step,
            next_visit_date=v.next_visit_date,
            cancel_reason=v.cancel_reason,
            report_source=v.report_source,
            reported_at=v.reported_at,
            products=[
                VisitProductOut(product_id=p.product_id, brand_name=p.product.brand_name)
                for p in v.products
            ],
            samples=[
                SampleOut(product_id=s.product_id, quantity=s.quantity, lot_number=s.lot_number,
                          brand_name=s.product.brand_name)
                for s in v.samples
            ],
            objections=[
                ObjectionOut(
                    category=o.category,
                    comment=o.comment,
                    product_id=o.product_id,
                    label=OBJECTION_CATEGORIES.get(o.category, o.category),
                )
                for o in v.objections
            ],
            report_pending=v.status == VisitStatus.PLANIFIEE and v.planned_at < now(),
        )


class VisitCreate(BaseModel):
    """Planifier une visite."""
    doctor_id: int
    planned_at: datetime
    notes: str | None = None


class VisitReschedule(BaseModel):
    """Déplacer une visite planifiée (glisser dans le calendrier)."""
    planned_at: datetime


class VisitCancel(BaseModel):
    reason: str
    # True = « reportée » (on replanifie à `new_planned_at`), False = « annulée »
    postpone: bool = False
    new_planned_at: datetime | None = None


class VisitReport(BaseModel):
    """
    Compte-rendu de visite. Le valider passe la visite en « réalisée ».
    Ce même schéma sera produit plus tard par l'assistant vocal (report_source="dictee").
    """
    actual_at: datetime | None = None
    duration_min: int = Field(ge=1, le=180)
    product_ids: list[int] = Field(min_length=1)
    feedback: str
    prescription_feedback: str | None = None   # enums.PrescriptionFeedback
    objections: list[ObjectionIn] = []
    samples: list[SampleIn] = []
    notes: str | None = None
    next_step: str | None = None
    next_visit_date: date | None = None
    # Si True et next_visit_date renseignée : crée automatiquement la prochaine visite
    plan_next_visit: bool = True
    report_source: str = "manuel"
