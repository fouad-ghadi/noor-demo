"""Logique métier des produits (catalogue et statistiques simples)."""
from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models import Doctor, DoctorProductStatus, Product, User, Visit, VisitProduct, VisitSample
from app.models.enums import PrescribingStatus, VisitStatus
from app.schemas.product import ProductDetail, ProductOut, ProductStats
from app.services import access
from app.services.dates import now


def list_products(db: Session) -> list[Product]:
    return list(
        db.scalars(select(Product).options(selectinload(Product.documents)).order_by(Product.brand_name))
    )


def get_product_detail(db: Session, user: User, product_id: int) -> ProductDetail:
    """Fiche produit + statistiques limitées au périmètre de l'utilisateur."""
    product = db.scalar(
        select(Product).where(Product.id == product_id).options(selectinload(Product.documents))
    )
    if product is None:
        raise HTTPException(404, "Produit introuvable")

    delegue_ids = access.visible_delegue_ids(db, user)
    doctor_ids = select(Doctor.id).where(Doctor.delegue_id.in_(delegue_ids))
    total_doctors = db.scalar(select(func.count()).select_from(doctor_ids.subquery())) or 0

    counts = dict(
        db.execute(
            select(DoctorProductStatus.status, func.count())
            .where(DoctorProductStatus.product_id == product_id,
                   DoctorProductStatus.doctor_id.in_(doctor_ids))
            .group_by(DoctorProductStatus.status)
        ).all()
    )
    regulier = counts.get(PrescribingStatus.REGULIER, 0)
    occasionnel = counts.get(PrescribingStatus.OCCASIONNEL, 0)

    since = now() - timedelta(days=30)
    recent_visits = select(Visit.id).where(
        Visit.delegue_id.in_(delegue_ids),
        Visit.status == VisitStatus.REALISEE,
        Visit.actual_at >= since,
    )
    presentations = db.scalar(
        select(func.count()).where(
            VisitProduct.product_id == product_id, VisitProduct.visit_id.in_(recent_visits)
        )
    ) or 0
    samples = db.scalar(
        select(func.coalesce(func.sum(VisitSample.quantity), 0)).where(
            VisitSample.product_id == product_id, VisitSample.visit_id.in_(recent_visits)
        )
    ) or 0

    return ProductDetail(
        **ProductOut.model_validate(product).model_dump(),
        stats=ProductStats(
            prescribers={
                "regulier": regulier,
                "occasionnel": occasionnel,
                "non_prescripteur": total_doctors - regulier - occasionnel,
            },
            presentations_last_30d=presentations,
            samples_last_30d=samples,
        ),
    )
