"""
Modèles SQLAlchemy (tables de la base).

On les importe tous ici pour que `Base.metadata.create_all()` les connaisse,
et pour pouvoir écrire simplement `from app.models import Doctor, Visit`.
"""
from app.models.alert import Alert
from app.models.doctor import Doctor, DoctorProductStatus
from app.models.objective import Objective, ObjectiveProduct
from app.models.product import Document, Product
from app.models.user import User
from app.models.visit import Visit, VisitObjection, VisitProduct, VisitSample

__all__ = [
    "Alert",
    "Doctor",
    "DoctorProductStatus",
    "Document",
    "Objective",
    "ObjectiveProduct",
    "Product",
    "User",
    "Visit",
    "VisitObjection",
    "VisitProduct",
    "VisitSample",
]
