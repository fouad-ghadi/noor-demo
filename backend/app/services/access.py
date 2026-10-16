"""
Règles de visibilité des données (qui voit quoi).

- Un délégué ne voit que SES médecins, SES visites, SES objectifs.
- Un superviseur voit tout ce qui concerne les délégués de son équipe.

⚠️ Démo : l'utilisateur courant est simplement identifié par l'en-tête HTTP
`X-User-Id`. Il n'y a pas de vraie authentification.
"""
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Doctor, User, Visit
from app.models.enums import Role


def visible_delegue_ids(db: Session, user: User) -> list[int]:
    """Liste des délégués dont `user` a le droit de voir les données."""
    if user.role == Role.DELEGUE:
        return [user.id]
    return list(
        db.scalars(select(User.id).where(User.supervisor_id == user.id, User.role == Role.DELEGUE))
    )


def resolve_delegue_ids(db: Session, user: User, delegue_id: int | None) -> list[int]:
    """
    Délégués à prendre en compte pour une requête.
    - sans `delegue_id` : tous ceux visibles par l'utilisateur ;
    - avec `delegue_id` : seulement lui, si l'utilisateur y a droit (sinon 403).
    """
    allowed = visible_delegue_ids(db, user)
    if delegue_id is None:
        return allowed
    if delegue_id not in allowed:
        raise HTTPException(status_code=403, detail="Accès refusé à ce délégué")
    return [delegue_id]


def check_delegue_access(db: Session, user: User, delegue_id: int) -> None:
    if delegue_id not in visible_delegue_ids(db, user):
        raise HTTPException(status_code=403, detail="Accès refusé à ce délégué")


def get_doctor_or_403(db: Session, user: User, doctor_id: int) -> Doctor:
    doctor = db.get(Doctor, doctor_id)
    if doctor is None:
        raise HTTPException(status_code=404, detail="Médecin introuvable")
    check_delegue_access(db, user, doctor.delegue_id)
    return doctor


def get_visit_or_403(db: Session, user: User, visit_id: int) -> Visit:
    visit = db.get(Visit, visit_id)
    if visit is None:
        raise HTTPException(status_code=404, detail="Visite introuvable")
    check_delegue_access(db, user, visit.delegue_id)
    return visit
