"""
Dépendances communes des routes.

`CurrentUser` : l'utilisateur connecté, lu dans l'en-tête HTTP `X-User-Id`
(envoyé automatiquement par le frontend après la connexion).
⚠️ Démo uniquement : n'importe qui peut envoyer n'importe quel id.
"""
from typing import Annotated

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User

DB = Annotated[Session, Depends(get_db)]


def get_current_user(db: DB, x_user_id: Annotated[int | None, Header()] = None) -> User:
    if x_user_id is None:
        raise HTTPException(401, "En-tête X-User-Id manquant : connectez-vous")
    user = db.get(User, x_user_id)
    if user is None:
        raise HTTPException(401, "Utilisateur inconnu")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
