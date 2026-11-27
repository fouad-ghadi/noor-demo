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

from app.ai.schemas import ClosingCheck, ClosingObjective, ClosingReport, ClosingVisit
from app.models import DayClosing, PharmacovigilanceCase, User, Visit
from app.models.enums import OBJECTION_CATEGORIES, PvCaseStatus, Role, VisitStatus
from app.services import activity_service
from app.services.dates import now, period_label, period_of
from app.services.objective_service import get_progress

DAILY_TARGET, SATURDAY_TARGET = 10, 5   # journée type d'un délégué (même règle que « Remplir ma semaine »)
FEEDBACK = {"tres_favorable": "très favorable", "favorable": "favorable", "neutre": "neutre",
            "reserve": "réservé", "defavorable": "défavorable"}
WEEKDAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]
MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."]


def _fmt(d: date) -> str:
    return f"{WEEKDAYS[d.weekday()]} {d.day} {MONTHS[d.month - 1]} {d.year}"


def _num(x: float) -> str:
    return f"{x:.1f}".replace(".", ",").replace(",0", "")


def _plural(n: int, singular: str, plural_form: str | None = None) -> str:
    """« 1 visite », « 3 visites » (0 et 1 au singulier, comme en français) : pas de « visite(s) »."""
    return f"{n} {singular if n < 2 else (plural_form or singular + 's')}"


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
        .options(selectinload(Visit.products), selectinload(Visit.samples), selectinload(Visit.doctor),
                 selectinload(Visit.objections))))


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
        to_fix.append(ClosingCheck(label=f"{_plural(len(later), 'visite encore prévue', 'visites encore prévues')} plus tard aujourd'hui", link="/planning"))
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
    if cancelled:
        lines.append("Annulées ou reportées : " + ", ".join(
            f"{v.doctor.full_name} ({v.cancel_reason or 'sans motif'})" for v in cancelled) + ".")

    objectives = _day_objectives(db, me, day, done, products)
    lines.append("Objectifs : " + " ; ".join(
        f"{o.label.lower()} {'atteint' if o.reached else 'non atteint'} ({o.detail})" for o in objectives) + ".")
    observations = _observations(done, pv, day)
    if observations:
        lines.append("Observations : " + " ".join(o.rstrip(".") + "." for o in observations))
    if to_fix:
        lines.append(f"Reste à faire : {_plural(len(to_fix), 'point')} (voir la liste).")
    else:
        lines.append("Tous les comptes-rendus sont saisis.")
    if tomorrow:
        lines.append(tomorrow)

    saved = db.scalar(select(DayClosing).where(DayClosing.delegue_id == me.id, DayClosing.day == day))
    return ClosingReport(
        scope="jour", title=f"Journée du {_fmt(day)}", day=day,
        figures={"prevues": len(visits), "realisees": len(done), "annulees": len(cancelled),
                 "comptes_rendus_manquants": len(missing), "manquants_du_jour": len(missing_today), "echantillons": sum(samples.values())},
        to_fix=to_fix, report="\n".join(lines),
        visits=[ClosingVisit(
            visit_id=v.id, doctor_id=v.doctor_id, doctor_name=v.doctor.full_name, time=f"{v.planned_at:%H:%M}",
            status=v.status, products=[vp.product.brand_name for vp in v.products],
            note=(f"Accueil {FEEDBACK.get(v.feedback, v.feedback)}" if v.status == VisitStatus.REALISEE and v.feedback
                  else v.cancel_reason if v.cancel_reason else None)) for v in visits],
        products=[f"{p} ({n})" for p, n in products.most_common()],
        objectives=objectives, observations=observations,
        validated_at=saved.validated_at if saved else None,
        validated_report=saved.report if saved else None,
    )


def _day_objectives(db: Session, me: User, day: date, done: list[Visit], products: Counter) -> list[ClosingObjective]:
    """Objectifs de la journée : visites, médecins ciblés, produits en retard sur l'objectif du mois."""
    target = SATURDAY_TARGET if day.weekday() == 5 else DAILY_TARGET
    out = [ClosingObjective(label="Visites de la journée", done=len(done), target=target, reached=len(done) >= target,
                            detail=f"{len(done)} réalisées pour {target} dans une journée type")]
    targeted = [v for v in done if v.doctor.frequency]
    goal = round(len(done) * 0.7) if done else 1
    out.append(ClosingObjective(label="Médecins ciblés vus", done=len(targeted), target=goal, reached=len(targeted) >= goal,
                                detail=f"{len(targeted)} médecins F1/F2 sur {len(done)} visites (repère : 70 %)"))
    progress = get_progress(db, me.id, period_of(day))
    if progress:
        late = [p for p in progress.products if p.pct < progress.expected_pct * 0.9]
        if late:
            pushed = [p.brand_name for p in late if products.get(p.brand_name)]
            out.append(ClosingObjective(
                label="Produits en retard présentés", done=len(pushed), target=len(late), reached=len(pushed) == len(late),
                detail=(", ".join(f"{p.brand_name} {'présenté' if p.brand_name in pushed else 'non présenté'}" for p in late)
                        + f" (en retard sur l'objectif de {period_label(period_of(day))})")))
    return out


def _observations(done: list[Visit], pv: list, day: date) -> list[str]:
    """Ce que le délégué (ou son superviseur) doit retenir de la journée."""
    obs = []
    for v in done:
        if v.prescription_feedback == "promesse_prescrire":
            names = ", ".join(vp.product.brand_name for vp in v.products)
            obs.append(f"{v.doctor.full_name} promet de prescrire {names} : à confirmer à la prochaine visite")
        if v.feedback in ("reserve", "defavorable"):
            obs.append(f"Accueil {FEEDBACK[v.feedback]} chez {v.doctor.full_name}")
        for o in v.objections:
            obs.append(f"Objection chez {v.doctor.full_name} : {_lower_first(OBJECTION_CATEGORIES.get(o.category, o.category))}"
                       + (f" ({o.product.brand_name})" if o.product else ""))
    for case in pv:
        if case.visit and case.visit.planned_at.date() == day:
            obs.append(f"Pharmacovigilance : {case.event} signalé, déclaration à faire sous 24 h")
    return obs[:8]


def _lower_first(text: str) -> str:
    return text[:1].lower() + text[1:]


def validate_day(db: Session, user: User, day: date, report: str) -> ClosingReport:
    """Le délégué a relu (et corrigé) son bilan : on l'enregistre. Il peut le revalider plus tard."""
    me = _delegue(user)
    if day > now().date():
        raise HTTPException(400, "On ne peut pas clôturer une journée à venir")
    saved = db.scalar(select(DayClosing).where(DayClosing.delegue_id == me.id, DayClosing.day == day))
    if saved is None:
        saved = DayClosing(delegue_id=me.id, day=day, report=report.strip(), validated_at=now())
        db.add(saved)
    else:
        saved.report, saved.validated_at = report.strip(), now()
    db.commit()
    return close_day(db, user, day)


def close_month(db: Session, user: User, period: str | None = None) -> ClosingReport:
    me = _delegue(user)
    period = period or period_of(now().date())
    row = activity_service.delegue_activity(db, me, period)
    progress = get_progress(db, me.id, period)
    pending = db.query(Visit).filter(Visit.delegue_id == me.id, Visit.status == VisitStatus.PLANIFIEE,
                                     Visit.planned_at <= now()).count()
    to_fix = []
    if pending:
        to_fix.append(ClosingCheck(label=f"{_plural(pending, 'compte-rendu', 'comptes-rendus')} en attente", link="/planning"))
    lines = [
        f"Rapport mensuel d'activité, {period_label(period)} ({me.name}, {me.region}).",
        f"Jours travaillés : {_num(row.worked_days)} sur {_num(row.period_days)} "
        f"({_num(row.event_days)} {'jours' if row.event_days >= 2 else 'jour'} d'événements).",
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
