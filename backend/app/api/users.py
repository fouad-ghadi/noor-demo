"""Utilisateurs et connexion (mock)."""
from fastapi import APIRouter

from app.api.deps import DB, CurrentUser
from app.schemas.user import LoginIn, UserOut
from app.services import access, user_service

router = APIRouter(tags=["Utilisateurs"])


@router.post("/auth/login", response_model=UserOut)
def login(data: LoginIn, db: DB):
    """Connexion avec email + mot de passe (mot de passe de démo : `demo`)."""
    return user_service.login(db, data.email, data.password)


@router.get("/users", response_model=list[UserOut])
def list_users(db: DB):
    """Tous les comptes de démo (écran de choix du profil). Pas d'authentification requise."""
    return user_service.list_users(db)


@router.get("/users/me", response_model=UserOut)
def me(user: CurrentUser):
    return user


@router.get("/users/team", response_model=list[UserOut])
def my_team(db: DB, user: CurrentUser):
    """Délégués visibles par l'utilisateur courant (lui-même s'il est délégué)."""
    return [user_service.get_user(db, i) for i in access.visible_delegue_ids(db, user)]
