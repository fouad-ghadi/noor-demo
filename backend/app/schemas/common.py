"""Base commune des schémas Pydantic."""
from pydantic import BaseModel, ConfigDict


class ORMModel(BaseModel):
    """Schéma pouvant être construit directement depuis un objet SQLAlchemy."""
    model_config = ConfigDict(from_attributes=True)
