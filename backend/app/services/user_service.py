"""Utilisateurs et connexion (mock, sans sécurité réelle)."""
from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import User


def login(db: Session, email: str, password: str) -> User:
    """Vérifie email + mot de passe (en clair, démo uniquement)."""
    user = db.scalar(select(User).where(func.lower(User.email) == email.strip().lower()))
    if user is None or user.password != password:
        raise HTTPException(401, "Email ou mot de passe incorrect")
    return user


def list_users(db: Session) -> list[User]:
    """Tous les utilisateurs (pour l'écran de sélection du profil à la connexion)."""
    return list(db.scalars(select(User).order_by(User.role.desc(), User.name)))


def get_user(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(404, "Utilisateur introuvable")
    return user
