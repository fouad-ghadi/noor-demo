"""Schémas des utilisateurs et de la connexion (mock)."""
from app.schemas.common import ORMModel
from pydantic import BaseModel


class UserOut(ORMModel):
    id: int
    name: str
    email: str
    role: str
    region: str
    phone: str | None = None
    supervisor_id: int | None = None


class LoginIn(BaseModel):
    email: str
    password: str
