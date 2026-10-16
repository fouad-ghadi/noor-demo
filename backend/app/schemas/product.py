"""Schémas des produits et documents."""
from datetime import datetime

from app.schemas.common import ORMModel


class ProductBrief(ORMModel):
    id: int
    brand_name: str
    molecule: str


class DocumentOut(ORMModel):
    id: int
    product_id: int
    title: str
    doc_type: str
    file_path: str | None = None
    version: str | None = None
    created_at: datetime


class ProductOut(ORMModel):
    id: int
    brand_name: str
    molecule: str
    therapeutic_class: str
    form_dosage: str
    description: str | None = None
    indications: list[str]
    key_messages: list[str]
    target_specialties: list[str]
    documents: list[DocumentOut] = []


class ProductStats(ORMModel):
    """Statistiques d'un produit, limitées au périmètre de l'utilisateur."""
    prescribers: dict[str, int]        # {"regulier": 12, "occasionnel": 8, "non_prescripteur": 20}
    presentations_last_30d: int
    samples_last_30d: int


class ProductDetail(ProductOut):
    stats: ProductStats
