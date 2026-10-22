"""Schémas des indicateurs d'activité terrain et des événements d'agenda."""
from datetime import date

from pydantic import BaseModel


class ActivityRow(BaseModel):
    """Une ligne du tableau « Couverture / Moyenne de visites par jour » (un délégué, ou l'équipe)."""
    delegue_id: int | None          # None = ligne « Équipe »
    name: str
    region: str
    period_days: float              # jours ouvrés de la période (samedi = ½ jour)
    event_days: float               # jours passés hors terrain
    worked_days: float              # = period_days − event_days
    targeted: int                   # ciblage : médecins ciblés (F1 + F2)
    targeted_f1: int
    targeted_f2: int
    calls: int                      # visites réalisées
    contacts: int                   # médecins différents visités
    targeted_visited: int           # médecins ciblés visités au moins une fois
    f1_ok: int                      # médecins F1 visités au moins 1 fois
    f2_ok: int                      # médecins F2 visités au moins 2 fois
    avg_visits_per_day: float       # moyenne de visites = calls / jours travaillés
    coverage_pct: float             # couverture = ciblés visités / ciblage
    cpa_pct: float                  # Call Plan Adherence = (F1 ok + F2 ok) / ciblage
    cpa_f1_pct: float
    cpa_f2_pct: float


class EventBreakdown(BaseModel):
    """Répartition des jours de la période : terrain et chaque type d'événement."""
    key: str                        # "terrain" ou un enums.EventType
    days: float


class ActivityTrendPoint(BaseModel):
    period: str
    label: str
    avg_visits_per_day: float
    coverage_pct: float
    cpa_pct: float


class ActivityOut(BaseModel):
    period: str
    period_label: str
    is_current: bool                # mois en cours : indicateurs « à date »
    through: date                   # dernier jour pris en compte
    rows: list[ActivityRow]         # un par délégué visible
    total: ActivityRow | None       # ligne « Équipe » (superviseur, plusieurs délégués)
    breakdown: list[EventBreakdown]
    trend: list[ActivityTrendPoint]  # 6 derniers mois (équipe ou délégué choisi)
    periods: list[str]              # mois disponibles (du plus récent au plus ancien)


class EventOut(BaseModel):
    id: int
    delegue_id: int
    delegue_name: str
    day: date
    type: str
    duration_days: float
    half: str | None
    comment: str | None


class EventCreate(BaseModel):
    day: date
    type: str
    half: str | None = None          # None = journée entière, "matin" ou "apres_midi"
    comment: str | None = None
    delegue_id: int | None = None    # superviseur : pour quel délégué
