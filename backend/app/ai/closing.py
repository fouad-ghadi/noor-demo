"""
╔══════════════════════════════════════════════════════════════════════╗
║  IA n°10 — « CLÔTURER MA JOURNÉE / MON MOIS »                         ║
║  Statut : implémenté (rapport rédigé à partir des données, sans clé)  ║
╚══════════════════════════════════════════════════════════════════════╝

Journée : visites faites, annulées, comptes-rendus manquants, produits présentés,
échantillons remis (avec n° de lot), cas de pharmacovigilance à déclarer, et la tournée du lendemain.
Mois : indicateurs du rapport mensuel (jours travaillés, calls, contacts, moyenne,
couverture, CPA F1 / F2) et objectifs.
Le rapport est rédigé automatiquement ; le délégué le relit (rien n'est envoyé).
"""
from collections import Counter
from datetime import date, datetime, time, timedelta

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.ai.schemas import ClosingCheck, ClosingReport
from app.models import PharmacovigilanceCase, User, Visit
from app.models.enums import PvCaseStatus, Role, VisitStatus
from app.services import activity_service
from app.services.dates import now, period_label, period_of
from app.services.objective_service import get_progress

WEEKDAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]
MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."]


def _fmt(d: date) -> str:
    return f"{WEEKDAYS[d.weekday()]} {d.day} {MONTHS[d.month - 1]} {d.year}"


def _num(x: float) -> str:
    return f"{x:.1f}".replace(".", ",").replace(",0", "")


def _delegue(user: User) -> User:
    if user.role != Role.DELEGUE:
        raise HTTPException(400, "La clôture est faite par le délégué")
    return user


def _day_visits(db: Session, delegue_id: int, day: date) -> list[Visit]:
    return list(db.scalars(
        select(Visit).where(Visit.delegue_id == delegue_id,
                            Visit.planned_at >= datetime.combine(day, time(0)),
                            Visit.planned_at < datetime.combine(day + timedelta(days=1), time(0)))
        .order_by(Visit.planned_at)
        .options(selectinload(Visit.products), selectinload(Visit.samples), selectinload(Visit.doctor))))


def close_day(db: Session, user: User, day: date | None = None) -> ClosingReport:
    me = _delegue(user)
    if day is None:
        # Par défaut : aujourd'hui, ou le dernier jour travaillé si aujourd'hui est sans visite (dimanche...)
        day = now().date()
        if not _day_visits(db, me.id, day):
            last = db.scalar(select(Visit.planned_at).where(Visit.delegue_id == me.id, Visit.planned_at < now())
                             .order_by(Visit.planned_at.desc()).limit(1))
            day = last.date() if last else day
    visits = _day_visits(db, me.id, day)
    done = [v for v in visits if v.status == VisitStatus.REALISEE and v.reported_at]
    # Comptes-rendus manquants : ceux du jour ET ceux des jours précédents encore en attente
    missing = list(db.scalars(
        select(Visit).where(Visit.delegue_id == me.id, Visit.status == VisitStatus.PLANIFIEE,
                            Visit.planned_at <= min(now(), datetime.combine(day + timedelta(days=1), time(0))))
        .order_by(Visit.planned_at).options(selectinload(Visit.doctor))))
    later = [v for v in visits if v.status == VisitStatus.PLANIFIEE and v.planned_at > now()]
    missing_today = [v for v in visits if v in missing]
    cancelled = [v for v in visits if v.status in (VisitStatus.ANNULEE, VisitStatus.REPORTEE)]
    products = Counter(vp.product.brand_name for v in done for vp in v.products)
    samples = Counter()
    lots: dict[str, set[str]] = {}
    for v in done:
        for s in v.samples:
            samples[s.product.brand_name] += s.quantity
            if s.lot_number:
                lots.setdefault(s.product.brand_name, set()).add(s.lot_number)

    to_fix = [ClosingCheck(label=f"Compte-rendu à saisir : {v.doctor.full_name} ({v.planned_at:%d/%m à %H:%M})",
                           link=f"/visites/{v.id}/compte-rendu") for v in missing]
    if later:
        to_fix.append(ClosingCheck(label=f"{len(later)} visite(s) encore prévue(s) plus tard aujourd'hui", link="/planning"))
    pv = list(db.scalars(select(PharmacovigilanceCase).where(
        PharmacovigilanceCase.delegue_id == me.id, PharmacovigilanceCase.status == PvCaseStatus.A_DECLARER)))
    for case in pv:
        to_fix.append(ClosingCheck(label=f"Pharmacovigilance à déclarer sous 24 h : {case.event}",
                                   link=f"/pharmacovigilance/{case.id}"))

    # Tournée du lendemain (prochain jour avec des visites planifiées)
    nxt = db.scalars(select(Visit).where(Visit.delegue_id == me.id, Visit.status == VisitStatus.PLANIFIEE,
                                         Visit.planned_at >= datetime.combine(day + timedelta(days=1), time(0)))
                     .order_by(Visit.planned_at).options(selectinload(Visit.doctor))).first()
    tomorrow = ""
    if nxt:
        n = len([v for v in _day_visits(db, me.id, nxt.planned_at.date()) if v.status == VisitStatus.PLANIFIEE])
        tomorrow = (f"Prochaine tournée : {_fmt(nxt.planned_at.date())}, {n} visites, "
                    f"première chez {nxt.doctor.full_name} à {nxt.planned_at:%H:%M}.")

    lines = [f"Rapport de la journée du {_fmt(day)} ({me.name}, {me.region}).",
             f"{len(done)} visites réalisées sur {len(visits)} prévues"
             + (f", {len(cancelled)} annulées ou reportées." if cancelled else ".")]
    if done:
        lines.append("Médecins vus : " + ", ".join(f"{v.doctor.full_name} ({v.doctor.specialty if v.doctor.specialty.isupper() else v.doctor.specialty.lower()})" for v in done) + ".")
    if products:
        lines.append("Produits présentés : " + ", ".join(f"{p} ({n})" for p, n in products.most_common()) + ".")
    if samples:
        lines.append("Échantillons remis : " + ", ".join(
            f"{n} × {p}" + (f" (lot {', '.join(sorted(lots[p]))})" if p in lots else "") for p, n in samples.items()) + ".")
    if to_fix:
        lines.append(f"Reste à faire : {len(to_fix)} point(s) (voir la liste).")
    else:
        lines.append("Tous les comptes-rendus sont saisis.")
    if tomorrow:
        lines.append(tomorrow)
    return ClosingReport(
        scope="jour", title=f"Journée du {_fmt(day)}",
        figures={"prevues": len(visits), "realisees": len(done), "annulees": len(cancelled),
                 "comptes_rendus_manquants": len(missing), "manquants_du_jour": len(missing_today), "echantillons": sum(samples.values())},
        to_fix=to_fix, report="\n".join(lines),
    )


def close_month(db: Session, user: User, period: str | None = None) -> ClosingReport:
    me = _delegue(user)
    period = period or period_of(now().date())
    row = activity_service.delegue_activity(db, me, period)
    progress = get_progress(db, me.id, period)
    pending = db.query(Visit).filter(Visit.delegue_id == me.id, Visit.status == VisitStatus.PLANIFIEE,
                                     Visit.planned_at <= now()).count()
    to_fix = []
    if pending:
        to_fix.append(ClosingCheck(label=f"{pending} compte(s)-rendu(s) en attente", link="/planning"))
    lines = [
        f"Rapport mensuel d'activité, {period_label(period)} ({me.name}, {me.region}).",
        f"Jours travaillés : {_num(row.worked_days)} sur {_num(row.period_days)} "
        f"({_num(row.event_days)} jour(s) d'événements).",
        f"Calls : {row.calls} visites, {row.contacts} médecins différents ; moyenne : {_num(row.avg_visits_per_day)} visites par jour.",
        f"Ciblage : {row.targeted} médecins ({row.targeted_f1} F1, {row.targeted_f2} F2) ; "
        f"couverture : {_num(row.coverage_pct)} % ; CPA : {_num(row.cpa_pct)} % "
        f"(F1 {_num(row.cpa_f1_pct)} %, F2 {_num(row.cpa_f2_pct)} %).",
    ]
    if progress:
        lines.append(f"Objectif de visites : {progress.done_visits} sur {progress.target_visits} "
                     f"({_num(progress.visits_pct)} %, attendu à date : {_num(progress.expected_pct)} %).")
        late = [p for p in progress.products if p.pct < progress.expected_pct * 0.9]
        if late:
            lines.append("Produits en retard sur l'objectif : " + ", ".join(p.brand_name for p in late) + ".")
    return ClosingReport(
        scope="mois", title=f"Mois de {period_label(period)}",
        figures={"jours_travailles": row.worked_days, "calls": row.calls, "contacts": row.contacts,
                 "moyenne": row.avg_visits_per_day, "couverture": row.coverage_pct, "cpa": row.cpa_pct,
                 "cpa_f1": row.cpa_f1_pct, "cpa_f2": row.cpa_f2_pct},
        to_fix=to_fix, report="\n".join(lines),
    )
