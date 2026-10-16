"""Schémas des statistiques des tableaux de bord (calculées côté serveur)."""
from datetime import date

from pydantic import BaseModel

from app.schemas.alert import AlertOut
from app.schemas.objective import ObjectiveProgress
from app.schemas.visit import VisitOut


class DashboardKpis(BaseModel):
    visits_done: int
    visits_target: int
    visits_expected_to_date: int     # objectif au prorata des jours ouvrés écoulés
    visits_planned_remaining: int    # visites encore planifiées ce mois
    coverage_a: float
    coverage_a_target: int
    pending_reports: int
    late_reports: int                # en attente depuis plus de 48 h
    cancelled_month: int             # annulées + reportées


class WeekPoint(BaseModel):
    week_start: date
    done: int
    cancelled: int


class DoctorToRevisit(BaseModel):
    doctor_id: int
    doctor_name: str
    specialty: str
    segment: str
    city: str
    district: str
    last_visit_date: date | None
    days_since_last_visit: int | None   # None = jamais visité
    next_visit_at: date | None          # déjà replanifié ?


class CountItem(BaseModel):
    key: str
    label: str
    count: int


class DashboardOut(BaseModel):
    delegue_id: int
    delegue_name: str
    region: str
    today: date
    today_visits: list[VisitOut]
    kpis: DashboardKpis
    objective: ObjectiveProgress | None
    visits_per_week: list[WeekPoint]
    doctors_to_revisit: list[DoctorToRevisit]
    doctors_to_revisit_total: int
    alerts: list[AlertOut]
    top_objections: list[CountItem]      # 3 derniers mois


class MonthPoint(BaseModel):
    period: str
    label: str
    done: int
    target: int
    pct: float


class TeamMemberStats(BaseModel):
    delegue_id: int
    name: str
    region: str
    doctors_count: int
    visits_done: int
    visits_target: int
    achievement_pct: float
    expected_pct: float
    coverage_a: float
    coverage_a_target: int
    cancelled: int
    cancel_rate: float
    pending_reports: int
    late_reports: int
    status: str                       # en_avance / dans_les_temps / en_retard
    history: list[MonthPoint]         # 6 derniers mois


class RegionStats(BaseModel):
    region: str
    delegue_name: str
    doctors: int
    coverage_by_segment: dict[str, float]    # {"A": 92.0, "B": 64.0, "C": 21.0} — mois en cours
    visits_by_month: list[MonthPoint]


class TeamOut(BaseModel):
    supervisor_name: str
    period: str
    period_label: str
    members: list[TeamMemberStats]
    regions: list[RegionStats]
    totals: dict[str, float]
    top_objections: list[CountItem]
