"""Indicateurs d'activité terrain et événements d'agenda (réunions, formations, congés...)."""
from datetime import date

from fastapi import APIRouter

from app.api.deps import DB, CurrentUser
from app.schemas.activity import ActivityOut, EventCreate, EventOut
from app.services import activity_service

router = APIRouter(tags=["Activité"])


@router.get("/activity", response_model=ActivityOut)
def activity(db: DB, user: CurrentUser, period: str | None = None, delegue_id: int | None = None):
    """
    Couverture, moyenne de visites par jour et CPA (Call Plan Adherence) d'un mois.
    `period` au format « 2026-10 » (mois en cours par défaut, indicateurs à date).
    """
    return activity_service.activity_overview(db, user, period, delegue_id)


@router.get("/events", response_model=list[EventOut])
def list_events(db: DB, user: CurrentUser, start: date, end: date, delegue_id: int | None = None):
    """Événements d'agenda entre deux dates incluses."""
    return activity_service.list_events(db, user, start, end, delegue_id)


@router.post("/events", response_model=EventOut, status_code=201)
def create_event(data: EventCreate, db: DB, user: CurrentUser):
    """Ajouter un événement (journée entière, ou demi-journée avec `half`)."""
    return activity_service.create_event(db, user, data)


@router.delete("/events/{event_id}", status_code=204)
def delete_event(event_id: int, db: DB, user: CurrentUser):
    activity_service.delete_event(db, user, event_id)
