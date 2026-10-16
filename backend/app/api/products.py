"""Routes des produits."""
from fastapi import APIRouter

from app.api.deps import DB, CurrentUser
from app.schemas.product import ProductDetail, ProductOut
from app.services import product_service

router = APIRouter(prefix="/products", tags=["Produits"])


@router.get("", response_model=list[ProductOut])
def list_products(db: DB, user: CurrentUser):
    return product_service.list_products(db)


@router.get("/{product_id}", response_model=ProductDetail)
def get_product(product_id: int, db: DB, user: CurrentUser):
    return product_service.get_product_detail(db, user, product_id)
