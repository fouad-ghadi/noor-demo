"""
Logique métier des médecins : recherche, fiche détaillée, création, modification.

Ces fonctions sont appelées par les routes API (app/api/doctors.py) et pourront
être réutilisées par les modules IA (ex. le scan de carte de visite créera un
médecin via `create_doctor`, la détection de doublons utilisera `list_doctors`).
"""
from collections import defaultdict
from datetime import date, datetime

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models import Doctor, DoctorProductStatus, Product, User, Visit
from app.models.enums import PrescribingStatus, Role, VisitFeedback, VisitStatus
from app.schemas.doctor import (
    DoctorCreate,
    DoctorDetail,
    DoctorListItem,
    DoctorOut,
    DoctorUpdate,
    PrescriptionIn,
    PrescriptionOut,
    SlotStat,
)
from app.schemas.visit import VisitOut
from app.services import access
from app.services.dates import now


# ---------------------------------------------------------------------------
# Helpers réutilisables (aussi utilisés par stats_service)
# ---------------------------------------------------------------------------

def last_visit_dates(db: Session, doctor_ids: list[int] | None = None) -> dict[int, datetime]:
    """{doctor_id: date de la dernière visite RÉALISÉE}."""
    q = (
        select(Visit.doctor_id, func.max(Visit.actual_at))
        .where(Visit.status == VisitStatus.REALISEE)
        .group_by(Visit.doctor_id)
    )
    if doctor_ids is not None:
        q = q.where(Visit.doctor_id.in_(doctor_ids))
    return {doctor_id: last for doctor_id, last in db.execute(q)}


def next_planned_visits(db: Session, doctor_ids: list[int] | None = None) -> dict[int, datetime]:
    """{doctor_id: date de la prochaine visite planifiée dans le futur}."""
    q = (
        select(Visit.doctor_id, func.min(Visit.planned_at))
        .where(Visit.status == VisitStatus.PLANIFIEE, Visit.planned_at >= now())
        .group_by(Visit.doctor_id)
    )
    if doctor_ids is not None:
        q = q.where(Visit.doctor_id.in_(doctor_ids))
    return {doctor_id: nxt for doctor_id, nxt in db.execute(q)}


def days_since(d: datetime | None) -> int | None:
    return None if d is None else (now().date() - d.date()).days


# ---------------------------------------------------------------------------
# Liste / recherche
# ---------------------------------------------------------------------------

def list_doctors(
    db: Session,
    user: User,
    *,
    search: str | None = None,
    city: str | None = None,
    specialty: str | None = None,
    segment: str | None = None,
    product_id: int | None = None,
    prescribing_status: str | None = None,
    last_visit: str | None = None,   # "lt30" | "30_60" | "gt60" | "never"
    delegue_id: int | None = None,
) -> list[DoctorListItem]:
    """Liste filtrée des médecins visibles par l'utilisateur."""
    delegue_ids = access.resolve_delegue_ids(db, user, delegue_id)

    q = (
        select(Doctor)
        .where(Doctor.delegue_id.in_(delegue_ids))
        .options(selectinload(Doctor.prescriptions).selectinload(DoctorProductStatus.product),
                 selectinload(Doctor.delegue))
        .order_by(Doctor.last_name, Doctor.first_name)
    )
    if search:
        # Recherche simple, insensible à la casse, sur nom / prénom / quartier / téléphone
        pattern = f"%{search.strip().lower()}%"
        q = q.where(
            func.lower(Doctor.last_name).like(pattern)
            | func.lower(Doctor.first_name).like(pattern)
            | func.lower(Doctor.first_name + " " + Doctor.last_name).like(pattern)
            | func.lower(Doctor.district).like(pattern)
            | Doctor.phone.like(pattern)
        )
    if city:
        q = q.where(Doctor.city == city)
    if specialty:
        q = q.where(Doctor.specialty == specialty)
    if segment:
        q = q.where(Doctor.segment == segment)
    if product_id and prescribing_status:
        # Médecins ayant ce statut pour ce produit. "non_prescripteur" inclut aussi
        # les médecins sans aucune ligne pour ce produit.
        matching = select(DoctorProductStatus.doctor_id).where(
            DoctorProductStatus.product_id == product_id,
            DoctorProductStatus.status == prescribing_status,
        )
        if prescribing_status == PrescribingStatus.NON_PRESCRIPTEUR:
            any_status = select(DoctorProductStatus.doctor_id).where(
                DoctorProductStatus.product_id == product_id
            )
            q = q.where(Doctor.id.in_(matching) | Doctor.id.not_in(any_status))
        else:
            q = q.where(Doctor.id.in_(matching))
    elif prescribing_status:
        # Sans produit : médecins ayant ce statut pour au moins un produit
        q = q.where(
            Doctor.id.in_(
                select(DoctorProductStatus.doctor_id).where(
                    DoctorProductStatus.status == prescribing_status
                )
            )
        )

    doctors = list(db.scalars(q))
    ids = [d.id for d in doctors]
    last = last_visit_dates(db, ids)
    nxt = next_planned_visits(db, ids)
    counts = dict(
        db.execute(
            select(Visit.doctor_id, func.count())
            .where(Visit.doctor_id.in_(ids), Visit.status == VisitStatus.REALISEE)
            .group_by(Visit.doctor_id)
        ).all()
    )

    items: list[DoctorListItem] = []
    for d in doctors:
        days = days_since(last.get(d.id))
        if last_visit == "never" and days is not None:
            continue
        if last_visit == "lt30" and (days is None or days >= 30):
            continue
        if last_visit == "30_60" and (days is None or not 30 <= days <= 60):
            continue
        if last_visit == "gt60" and (days is not None and days <= 60):
            continue  # "gt60" inclut aussi les médecins jamais visités
        items.append(
            DoctorListItem(
                **DoctorOut.model_validate(d).model_dump(),
                delegue_name=d.delegue.name,
                last_visit_date=last[d.id].date() if d.id in last else None,
                days_since_last_visit=days,
                next_visit_at=nxt.get(d.id),
                visits_count=counts.get(d.id, 0),
                regular_products=sorted(
                    p.product.brand_name for p in d.prescriptions if p.status == PrescribingStatus.REGULIER
                ),
            )
        )
    return items


# ---------------------------------------------------------------------------
# Fiche détaillée
# ---------------------------------------------------------------------------

def _prescriptions_out(db: Session, doctor: Doctor) -> list[PrescriptionOut]:
    """Statut de prescription pour TOUS les produits (non_prescripteur par défaut)."""
    by_product = {p.product_id: p.status for p in doctor.prescriptions}
    products = db.scalars(select(Product).order_by(Product.brand_name))
    return [
        PrescriptionOut(
            product_id=p.id,
            brand_name=p.brand_name,
            molecule=p.molecule,
            status=by_product.get(p.id, PrescribingStatus.NON_PRESCRIPTEUR),
        )
        for p in products
    ]


def _slot_of(dt: datetime) -> str:
    if dt.hour < 12:
        return "matin"
    if dt.hour < 14:
        return "midi"
    return "apres_midi"


def get_doctor_detail(db: Session, user: User, doctor_id: int) -> DoctorDetail:
    doctor = access.get_doctor_or_403(db, user, doctor_id)
    visits = list(
        db.scalars(
            select(Visit)
            .where(Visit.doctor_id == doctor.id)
            .order_by(Visit.planned_at.desc())
            .options(selectinload(Visit.products), selectinload(Visit.samples),
                     selectinload(Visit.objections))
        )
    )
    current = now()
    done = [v for v in visits if v.status == VisitStatus.REALISEE]
    upcoming = sorted(
        (v for v in visits if v.status == VisitStatus.PLANIFIEE and v.planned_at >= current),
        key=lambda v: v.planned_at,
    )
    last_dt = max((v.actual_at or v.planned_at for v in done), default=None)

    # Réceptivité par créneau : % de visites avec un retour favorable ou très favorable
    by_slot: dict[str, list[Visit]] = defaultdict(list)
    for v in done:
        by_slot[_slot_of(v.actual_at or v.planned_at)].append(v)
    positive = {VisitFeedback.FAVORABLE, VisitFeedback.TRES_FAVORABLE}
    slot_stats = [
        SlotStat(
            slot=slot,
            visits=len(by_slot[slot]),
            favorable_rate=round(
                100 * sum(v.feedback in positive for v in by_slot[slot]) / len(by_slot[slot]), 1
            ) if by_slot[slot] else 0.0,
        )
        for slot in ("matin", "midi", "apres_midi")
    ]

    return DoctorDetail(
        **DoctorOut.model_validate(doctor).model_dump(),
        delegue_name=doctor.delegue.name,
        prescriptions=_prescriptions_out(db, doctor),
        visits=[VisitOut.from_model(v) for v in visits],
        next_visit=VisitOut.from_model(upcoming[0]) if upcoming else None,
        last_visit_date=last_dt.date() if last_dt else None,
        days_since_last_visit=days_since(last_dt),
        visits_count=len(done),
        slot_stats=slot_stats,
    )


# ---------------------------------------------------------------------------
# Création / modification
# ---------------------------------------------------------------------------

def _apply_prescriptions(db: Session, doctor: Doctor, prescriptions: list[PrescriptionIn]) -> None:
    valid = {s.value for s in PrescribingStatus}
    existing = {p.product_id: p for p in doctor.prescriptions}
    for item in prescriptions:
        if item.status not in valid:
            raise HTTPException(400, f"Statut de prescription invalide : {item.status}")
        if item.product_id in existing:
            existing[item.product_id].status = item.status
        else:
            doctor.prescriptions.append(
                DoctorProductStatus(product_id=item.product_id, status=item.status)
            )


def create_doctor(db: Session, user: User, data: DoctorCreate) -> Doctor:
    """Crée une fiche médecin. Un délégué crée toujours dans son propre portefeuille."""
    if user.role == Role.DELEGUE:
        delegue_id = user.id
    else:
        if data.delegue_id is None:
            raise HTTPException(400, "Choisissez le délégué responsable de ce médecin")
        access.check_delegue_access(db, user, data.delegue_id)
        delegue_id = data.delegue_id

    fields = data.model_dump(exclude={"delegue_id", "prescriptions"})
    doctor = Doctor(**fields, delegue_id=delegue_id, created_at=now())
    _apply_prescriptions(db, doctor, data.prescriptions)
    db.add(doctor)
    db.commit()
    db.refresh(doctor)
    return doctor


def update_doctor(db: Session, user: User, doctor_id: int, data: DoctorUpdate) -> Doctor:
    doctor = access.get_doctor_or_403(db, user, doctor_id)
    for field, value in data.model_dump(exclude={"prescriptions"}).items():
        setattr(doctor, field, value)
    if data.prescriptions is not None:
        _apply_prescriptions(db, doctor, data.prescriptions)
    db.commit()
    db.refresh(doctor)
    return doctor
