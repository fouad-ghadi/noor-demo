"""
╔══════════════════════════════════════════════════════════════════════╗
║  IA n°8 — AGENT « REMPLIR MA SEMAINE » (agenda automatique)           ║
║  Statut : implémenté (règles expliquées, aucune clé nécessaire)       ║
╚══════════════════════════════════════════════════════════════════════╝

Le délégué clique « Remplir ma semaine » : NOOR propose des visites pour les places
libres de son agenda, puis le délégué décoche ce qu'il ne veut pas et valide.

Étapes
    1. Places libres : 10 visites par jour (5 le samedi matin), moins les visites déjà
       planifiées ; journée d'événement (formation, congé...) = pas de visite,
       demi-journée = moitié des places.
    2. Qui voir ? Les médecins classés par le copilote (recommendations.py) :
       ciblage F1/F2 en retard, potentiel, produits à pousser, parts de marché.
    3. Regroupement par QUARTIER : chaque jour reçoit une zone (le quartier où il y a
       le plus de médecins prioritaires ce jour-là, puis les quartiers les plus proches)
       → moins de route, plus de visites.
    4. Jours de RÉCEPTION : un médecin n'est proposé qu'un jour où il reçoit les délégués,
       et sur son créneau préféré (matin, midi, après-midi).
    5. Ordre de la tournée : par créneau, puis du plus proche au plus proche.
Chaque visite proposée garde son « pourquoi ». Rien n'est enregistré avant la validation.
"""
import math
from collections import defaultdict
from datetime import date, datetime, time, timedelta

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.recommendations import _recommend_for
from app.ai.schemas import DayPlan, PlannedProposal, WeekPlan, WeekPlanItem
from app.models import Doctor, Event, User, Visit
from app.models.enums import Role, VisitStatus
from app.schemas.visit import VisitCreate
from app.services import access, visit_service
from app.services.dates import now, week_start

DAILY_TARGET = 10
SATURDAY_TARGET = 5
WEEKDAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"]
MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."]
EVENT_LABELS = {
    "reunion_equipe": "Réunion d'équipe", "formation": "Formation", "congres": "Congrès", "staff": "Staff",
    "table_ronde": "Table ronde", "administratif": "Administratif", "conge_annuel": "Congé",
    "conge_maladie": "Congé maladie", "fete": "Jour férié", "autre": "Événement",
}
SLOT_START = {"matin": time(9, 0), "midi": time(12, 0), "apres_midi": time(14, 30)}
SLOT_STEP_MIN = {"matin": 30, "midi": 30, "apres_midi": 35}
SLOT_ORDER = {"matin": 0, "midi": 1, "apres_midi": 2}


def _fmt_day(d: date) -> str:
    return f"{d.day} {MONTHS[d.month - 1]} {d.year}"


def _distance(a: tuple[float, float], b: tuple[float, float]) -> float:
    """Distance approximative en km entre deux points (latitude, longitude)."""
    dx = (a[1] - b[1]) * 111 * math.cos(math.radians(a[0]))
    dy = (a[0] - b[0]) * 111
    return math.hypot(dx, dy)


def _receives(doctor: Doctor, d: date) -> bool:
    return not doctor.reception_days or str(d.weekday()) in doctor.reception_days.split(",")


def _reception_text(doctor: Doctor) -> str:
    if not doctor.reception_days:
        return "reçoit tous les jours"
    names = [WEEKDAYS[int(x)] for x in doctor.reception_days.split(",") if int(x) < 6]
    return "reçoit le " + " et le ".join([", ".join(names[:-1]), names[-1]] if len(names) > 1 else names)


def _target_delegue(db: Session, user: User, delegue_id: int | None) -> int:
    if delegue_id is None:
        if user.role != Role.DELEGUE:
            raise HTTPException(400, "Choisir un délégué")
        return user.id
    access.check_delegue_access(db, user, delegue_id)
    return delegue_id


def _days_of_week(db: Session, delegue_id: int, monday: date) -> list[dict]:
    """Jours de la semaine avec leurs places libres (événements et visites déjà planifiées déduits)."""
    days = [monday + timedelta(days=i) for i in range(6)]
    events = {e.day: e for e in db.scalars(
        select(Event).where(Event.delegue_id == delegue_id, Event.day >= days[0], Event.day <= days[-1]))}
    planned = defaultdict(list)
    for v in db.scalars(select(Visit).where(
            Visit.delegue_id == delegue_id, Visit.status == VisitStatus.PLANIFIEE,
            Visit.planned_at >= datetime.combine(days[0], time(0)),
            Visit.planned_at < datetime.combine(days[-1] + timedelta(days=1), time(0)))):
        planned[v.planned_at.date()].append(v)
    today = now().date()
    result = []
    for d in days:
        if d <= today:
            continue  # on ne remplit pas le passé ni la journée en cours
        event = events.get(d)
        target = SATURDAY_TARGET if d.weekday() == 5 else DAILY_TARGET
        slots = ["matin"] if d.weekday() == 5 else ["matin", "midi", "apres_midi"]
        label = None
        if event:
            label = EVENT_LABELS.get(event.type, "Événement")
            if event.duration_days >= 1 or d.weekday() == 5:
                target, slots = 0, []
            else:
                target //= 2
                slots = ["midi", "apres_midi"] if event.half == "matin" else ["matin", "midi"]
                label += " (matin)" if event.half == "matin" else " (après-midi)"
        result.append({"day": d, "target": target, "slots": slots, "event": label, "planned": planned[d]})
    return result


def _first_free_week(db: Session, delegue_id: int) -> date:
    """Première semaine (à partir de la semaine prochaine si on est dimanche) qui a des places libres."""
    monday = week_start(now().date())
    for _ in range(6):
        free = sum(max(0, d["target"] - len(d["planned"])) for d in _days_of_week(db, delegue_id, monday))
        if free >= 10:
            return monday
        monday += timedelta(days=7)
    return monday


def plan_week(db: Session, user: User, start: date | None = None, delegue_id: int | None = None) -> WeekPlan:
    delegue = _target_delegue(db, user, delegue_id)
    monday = week_start(start) if start else _first_free_week(db, delegue)
    days = _days_of_week(db, delegue, monday)

    # Médecins déjà planifiés cette semaine (ou plus tard) : exclus par le copilote
    candidates = {r.doctor_id: r for r in _recommend_for(db, delegue, as_of=max(monday, now().date()))}
    doctors = {d.id: d for d in db.scalars(select(Doctor).where(Doctor.id.in_(candidates)))}
    remaining = set(candidates)
    planned_doctor_ids = {v.doctor_id for d in days for v in d["planned"]}
    remaining -= planned_doctor_ids

    day_plans = []
    for d in days:
        free = max(0, d["target"] - len(d["planned"]))
        day = d["day"]
        proposals: list[PlannedProposal] = []
        zone, zone_reason = [], ""
        if free:
            # Médecins prioritaires qui reçoivent ce jour-là, sur un créneau disponible
            pool = [doctors[i] for i in remaining
                    if _receives(doctors[i], day) and (doctors[i].preferred_slot or "matin") in d["slots"]]
            # Quartier principal : le plus de priorité cumulée, en tenant compte des visites déjà prévues
            weight = defaultdict(float)
            for doc in pool:
                weight[doc.district] += candidates[doc.id].score
            for v in d["planned"]:
                weight[v.doctor.district] += 0.5
            if weight:
                main = max(weight, key=weight.get)
                center = _center([doc for doc in pool if doc.district == main]
                                 or [v.doctor for v in d["planned"] if v.doctor.district == main])
                # Les médecins du quartier principal d'abord, puis les plus proches (tri par distance pondérée)
                pool.sort(key=lambda doc: (doc.district != main,
                                           _distance(center, _pos(doc)) - 3 * candidates[doc.id].score))
                chosen = pool[:free]
                zone = sorted({doc.district for doc in chosen} | ({main} if chosen else set()),
                              key=lambda z: (z != main, z))
                n_main = sum(doc.district == main for doc in chosen)
                zone_reason = (f"{n_main} médecin{'s' if n_main > 1 else ''} prioritaire{'s' if n_main > 1 else ''} "
                               f"à {main}" + (f", complété par les quartiers voisins" if len(zone) > 1 else ""))
                proposals = _schedule(day, chosen, candidates, d["planned"])
                remaining -= {doc.id for doc in chosen}
        elif d["planned"]:
            zone_reason = "Journée déjà complète"
        day_plans.append(DayPlan(
            day=day, zone=zone[:3], zone_reason=zone_reason, capacity=d["target"],
            already_planned=len(d["planned"]), event=d["event"], proposals=proposals,
        ))

    total = sum(len(dp.proposals) for dp in day_plans)
    top_left = [i for i in remaining if candidates[i].score >= 0.5]
    summary = (f"{total} visites proposées pour la semaine du {_fmt_day(monday)}, regroupées par quartier "
               f"et placées les jours où chaque médecin reçoit.")
    if top_left:
        summary += f" {len(top_left)} médecins prioritaires restent à placer (jours de réception déjà pleins)."
    return WeekPlan(week_start=monday, label=f"semaine du {_fmt_day(monday)}", days=day_plans,
                    total_proposed=total, not_placed=len(top_left), summary=summary)


def _pos(doc: Doctor) -> tuple[float, float]:
    return (doc.latitude or 0.0, doc.longitude or 0.0)


def _center(docs: list[Doctor]) -> tuple[float, float]:
    pts = [_pos(d) for d in docs if d.latitude]
    if not pts:
        return (0.0, 0.0)
    return (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))


def _schedule(day: date, chosen: list[Doctor], candidates: dict, planned: list[Visit]) -> list[PlannedProposal]:
    """Heures de passage : par créneau, en suivant le plus proche voisin, sans chevaucher l'agenda existant."""
    busy = {v.planned_at.replace(second=0, microsecond=0) for v in planned}
    by_slot = defaultdict(list)
    for doc in chosen:
        by_slot[doc.preferred_slot or "matin"].append(doc)
    out = []
    for slot in sorted(by_slot, key=SLOT_ORDER.get):
        docs = by_slot[slot]
        ordered, current = [], _center(docs)
        while docs:  # plus proche voisin
            nxt = min(docs, key=lambda d: _distance(current, _pos(d)))
            ordered.append(nxt)
            docs.remove(nxt)
            current = _pos(nxt)
        t = datetime.combine(day, SLOT_START[slot])
        for doc in ordered:
            while t in busy:
                t += timedelta(minutes=SLOT_STEP_MIN[slot])
            busy.add(t)
            reco = candidates[doc.id]
            reasons = list(reco.reasons[:2]) + [f"{_reception_text(doc).capitalize()}, quartier {doc.district}"]
            out.append(PlannedProposal(
                doctor_id=doc.id, doctor_name=doc.full_name, specialty=doc.specialty, segment=doc.segment,
                frequency=doc.frequency, district=doc.district, planned_at=t, slot=slot, score=reco.score,
                reasons=reasons,
            ))
            t += timedelta(minutes=SLOT_STEP_MIN[slot])
    return out


def confirm(db: Session, user: User, items: list[WeekPlanItem]) -> int:
    """Le délégué valide : les visites cochées sont planifiées (mêmes règles que « Planifier une visite »)."""
    for item in items:
        visit_service.plan_visit(db, user, VisitCreate(doctor_id=item.doctor_id, planned_at=item.planned_at,
                                                       notes="Planifiée avec « Remplir ma semaine »"))
    return len(items)
