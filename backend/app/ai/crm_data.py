"""
╔══════════════════════════════════════════════════════════════════════╗
║  IA n°2 (suite) — ASSISTANT NOOR : « MES CHIFFRES »                  ║
║  Statut : implémenté (règles ; Claude facultatif, avec des outils)    ║
╚══════════════════════════════════════════════════════════════════════╝

Objectif
    Répondre aux questions d'un délégué sur SES données : « Quel est mon CPA ? »,
    « Quels médecins F2 n'ai-je pas vus ? », « Ma tournée de demain ? »...
    L'assistant ne devine jamais un chiffre : il appelle des OUTILS qui interrogent
    la base avec les mêmes calculs que les pages de l'application
    (activity_service pour le CPA, objective_service pour les objectifs...),
    et cite la page où vérifier (lien « /statistiques », « /objectifs »...).

Les outils (un outil = une fonction Python + sa description pour Claude)
    indicateurs_activite      CPA, couverture, moyenne de visites / jour, jours travaillés
    medecins_a_voir           médecins ciblés pas encore vus à la bonne fréquence ce mois-ci
    visites_du_jour           la tournée d'un jour (aujourd'hui, demain, lundi, une date...)
    objectifs_du_mois         avancement de l'objectif mensuel
    comptes_rendus_en_attente visites passées sans compte-rendu

Deux façons de choisir l'outil
    - avec Claude (ANTHROPIC_API_KEY) : Claude lit la question, choisit le ou les outils
      et leurs paramètres (« tool use »), puis rédige la réponse à partir des résultats ;
    - sans clé : des règles (mots-clés) choisissent l'outil, et la réponse est une
      phrase type remplie avec les résultats.

Droits d'accès
    Les outils passent par services/access.py : un délégué ne voit que ses données
    (demander le CPA d'un collègue renvoie un refus) ; un superviseur voit son équipe.
"""
import json
import re
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai import llm
from app.ai.pharmacovigilance import normalize
from app.ai.schemas import AskRequest, AskResponse, Citation
from app.models import Doctor, User, Visit
from app.models.enums import VISITS_PER_MONTH, Frequency, Role, VisitStatus
from app.services import access, activity_service, objective_service
from app.services.dates import now, period_label, period_of, previous_periods
from app.services.doctor_service import last_visit_dates, next_planned_visits

MONTHS_SHORT = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."]
WEEKDAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]
STATUS_LABELS = {"planifiee": "planifiée", "realisee": "réalisée", "annulee": "annulée", "reportee": "reportée"}
PROGRESS_LABELS = {"en_avance": "en avance", "dans_les_temps": "dans les temps", "en_retard": "en retard"}


# ---------------------------------------------------------------------------
# Petits utilitaires d'affichage (format français, comme src/lib/format.ts)
# ---------------------------------------------------------------------------

def fmt_date(d: date | datetime) -> str:
    """date(2026, 10, 16) -> « 16 oct. 2026 »."""
    return f"{d.day} {MONTHS_SHORT[d.month - 1]} {d.year}"


def fmt_pct(x: float) -> str:
    """62.5 -> « 62,5 % » ; 40.0 -> « 40 % »."""
    return f"{x:.1f}".rstrip("0").rstrip(".").replace(".", ",") + " %"


def fmt_num(x: float) -> str:
    return f"{x:.2f}".rstrip("0").rstrip(".").replace(".", ",")


class ToolError(Exception):
    """Erreur expliquée au délégué (ex. accès refusé) : renvoyée telle quelle à Claude ou dans la réponse."""


@dataclass
class ToolResult:
    data: dict                       # résultat brut (envoyé à Claude en JSON)
    text: str                        # réponse rédigée sans Claude
    citation: Citation               # source : page de l'application où vérifier
    extra: list[str] = field(default_factory=list)  # lignes de détail (liste de médecins, de visites...)


# ---------------------------------------------------------------------------
# Qui est concerné ? (soi-même, un délégué nommé, ou toute l'équipe)
# ---------------------------------------------------------------------------

def find_delegue(db: Session, text: str) -> User | None:
    """Délégué dont le prénom ou le nom apparaît dans le texte (« le CPA de Hamza »)."""
    q = f" {normalize(text)} "
    for d in db.scalars(select(User).where(User.role == Role.DELEGUE)):
        for part in normalize(d.name).replace("-", " ").split():
            if len(part) >= 4 and re.search(rf"\b{re.escape(part)}\b", q):
                return d
    return None


def _targets(db: Session, user: User, delegue: str) -> list[User]:
    """Délégués concernés par la question, en respectant les droits d'accès."""
    if delegue.strip():
        found = find_delegue(db, delegue)
        if found is None:
            raise ToolError(f"Je ne trouve pas de délégué nommé « {delegue} ».")
        if found.id not in access.visible_delegue_ids(db, user):
            raise ToolError("Vous ne pouvez consulter que vos propres données (ou celles de votre équipe si vous êtes superviseur).")
        return [found]
    ids = access.visible_delegue_ids(db, user)
    return list(db.scalars(select(User).where(User.id.in_(ids)).order_by(User.name)))


def _who(user: User, targets: list[User]) -> str:
    """« Votre », « L'équipe », ou « Hamza Ait Lahcen » : le sujet de la phrase."""
    if len(targets) == 1 and targets[0].id == user.id:
        return "vous"
    if len(targets) == 1:
        return targets[0].name
    return "l'équipe"


def _de(name: str) -> str:
    """« de Hamza », « d'Imane », « de l'équipe »."""
    return f"d'{name}" if normalize(name[:1]) in "aeiouyh" and not name.startswith("l'") else f"de {name}"


def _period(mois: str) -> str:
    current = period_of(now().date())
    return previous_periods(current, 2)[0] if mois == "precedent" else current


# ---------------------------------------------------------------------------
# Les outils
# ---------------------------------------------------------------------------

def indicateurs_activite(db: Session, user: User, mois: str = "courant", delegue: str = "", focus: str = "cpa") -> ToolResult:
    """CPA, couverture, moyenne de visites par jour : mêmes calculs que la page Statistiques."""
    targets = _targets(db, user, delegue)
    period = _period(mois)
    rows, team, _ = activity_service.activity_rows(db, targets, period)
    row = rows[0] if len(rows) == 1 else team
    first, last = activity_service.period_range(period)
    is_current = period == period_of(now().date())
    when = f"en {period_label(period)}" + (f" (à date du {fmt_date(last)})" if is_current else "")
    who = _who(user, targets)

    data = {
        "periode": period_label(period), "a_date_du": last.isoformat(), "concerne": who,
        "cpa_pct": row.cpa_pct, "cpa_f1_pct": row.cpa_f1_pct, "cpa_f2_pct": row.cpa_f2_pct,
        "couverture_pct": row.coverage_pct, "moyenne_visites_par_jour": row.avg_visits_per_day,
        "visites_realisees": row.calls, "medecins_vus": row.contacts, "jours_travailles": row.worked_days,
        "medecins_cibles": row.targeted, "cibles_f1": row.targeted_f1, "cibles_f2": row.targeted_f2,
        "f1_vus_au_moins_1_fois": row.f1_ok, "f2_vus_au_moins_2_fois": row.f2_ok,
        "cibles_vus": row.targeted_visited,
        "definition_cpa": "(F1 vus au moins 1 fois + F2 vus au moins 2 fois) / médecins ciblés",
    }
    if len(rows) > 1:
        data["par_delegue"] = [{"delegue": r.name, "cpa_pct": r.cpa_pct, "couverture_pct": r.coverage_pct,
                                "moyenne_visites_par_jour": r.avg_visits_per_day} for r in rows]

    subject = {"cpa": "CPA", "couverture": "couverture de la cible", "moyenne": "moyenne de visites par jour"}
    values = {"cpa": fmt_pct(row.cpa_pct), "couverture": fmt_pct(row.coverage_pct), "moyenne": fmt_num(row.avg_visits_per_day)}
    details = {
        "cpa": f"{row.f1_ok} médecins F1 sur {row.targeted_f1} vus au moins une fois et "
               f"{row.f2_ok} médecins F2 sur {row.targeted_f2} vus au moins deux fois",
        "couverture": f"{row.targeted_visited} médecins ciblés vus sur {row.targeted}",
        "moyenne": f"{row.calls} visites sur {fmt_num(row.worked_days)} jours travaillés",
    }
    focus = focus if focus in subject else "cpa"
    article = "Le" if focus == "cpa" else "La"
    owner = "Votre" if who == "vous" else f"{article}"
    first = (f"{owner} {subject[focus]}{'' if who == 'vous' else ' ' + _de(who)} est de {values[focus]} {when} : "
             f"{details[focus]}.")
    others = [f"{subject[k][0].upper() + subject[k][1:]} : {values[k]} ({details[k]})." for k in subject if k != focus]
    text = " ".join([first] + others)
    extra = [f"{r.name} : CPA {fmt_pct(r.cpa_pct)}, couverture {fmt_pct(r.coverage_pct)}" for r in rows] if len(rows) > 1 else []
    citation = Citation(
        document_id=0, document_title="Vos données NOOR : statistiques d'activité", section=period_label(period).capitalize(),
        excerpt=f"CPA {fmt_pct(row.cpa_pct)}, couverture {fmt_pct(row.coverage_pct)}, "
                f"{fmt_num(row.avg_visits_per_day)} visites par jour, {row.targeted} médecins ciblés.",
        link="/statistiques",
    )
    return ToolResult(data, text, citation, extra)


def medecins_a_voir(db: Session, user: User, frequence: str = "tous", delegue: str = "", limite: int = 8) -> ToolResult:
    """Médecins ciblés qui n'ont pas encore eu leur nombre de visites du mois (F1 : 1, F2 : 2)."""
    targets = _targets(db, user, delegue)
    ids = [t.id for t in targets]
    names = {t.id: t.name for t in targets}
    first, last = activity_service.period_range(period_of(now().date()))
    frequencies, visits = activity_service._raw_counts(db, ids, first, last)  # mêmes comptes que le CPA

    wanted = {Frequency.F1, Frequency.F2} if frequence not in ("F1", "F2") else {Frequency(frequence)}
    missing = [doc for doc, (_, f) in frequencies.items() if f in wanted and visits[doc] < VISITS_PER_MONTH[Frequency(f)]]
    doctors = {d.id: d for d in db.scalars(select(Doctor).where(Doctor.id.in_(missing)))}
    last_seen = last_visit_dates(db, missing)
    planned = next_planned_visits(db, missing)
    # Priorité : F2 d'abord, potentiel A > B > C, puis le moins vu récemment
    order = sorted(missing, key=lambda i: (doctors[i].frequency != Frequency.F2, doctors[i].segment,
                                           last_seen.get(i) or datetime.min))

    def line(i: int) -> str:
        d = doctors[i]
        need = VISITS_PER_MONTH[Frequency(d.frequency)]
        seen = f"vu {visits[i]} fois sur {need} ce mois-ci" if visits[i] else "pas encore vu ce mois-ci"
        nxt = f", visite prévue le {fmt_date(planned[i])}" if i in planned else ", aucune visite planifiée"
        owner = f" ({names[d.delegue_id]})" if len(targets) > 1 else ""
        return f"{d.full_name}, {d.specialty.lower()}, {d.frequency} segment {d.segment}, {seen}{nxt}{owner}"

    label = {"F1": "F1", "F2": "F2"}.get(frequence, "ciblés F1 et F2")
    n_planned = sum(1 for i in missing if i in planned)
    who = _who(user, targets)
    if not missing:
        text = f"Tous les médecins {label} ont déjà eu leurs visites de {period_label(period_of(now().date()))}. Bravo !"
    else:
        text = (
            f"{len(missing)} médecins {label} {_de(who) + ' ' if who != 'vous' else ''}n'ont pas encore eu toutes leurs visites "
            f"de {period_label(period_of(now().date()))} ; {n_planned} ont déjà une visite planifiée. "
            f"À voir en priorité :"
        )
    data = {
        "mois": period_label(period_of(now().date())), "frequence": label, "nombre": len(missing),
        "deja_planifies": n_planned,
        "medecins": [
            {"nom": doctors[i].full_name, "specialite": doctors[i].specialty, "frequence": doctors[i].frequency,
             "segment": doctors[i].segment, "visites_ce_mois": visits[i],
             "visites_attendues": VISITS_PER_MONTH[Frequency(doctors[i].frequency)],
             "derniere_visite": last_seen[i].date().isoformat() if i in last_seen else None,
             "prochaine_visite": planned[i].date().isoformat() if i in planned else None,
             "delegue": names[doctors[i].delegue_id]}
            for i in order[:limite]
        ],
    }
    citation = Citation(
        document_id=0, document_title="Vos données NOOR : médecins ciblés", section=f"Médecins {label}",
        excerpt=f"{len(missing)} médecins {label} à voir ce mois-ci, dont {n_planned} déjà planifiés.",
        link="/medecins",
    )
    return ToolResult(data, text, citation, [line(i) for i in order[:limite]])


def parse_day(text: str) -> date | None:
    """« aujourd'hui », « demain », « après-demain », « lundi », « 2026-11-24 », « 24/11 » → date."""
    today = now().date()
    t = normalize(text)
    if m := re.search(r"(\d{4})-(\d{2})-(\d{2})", t):
        return date(int(m[1]), int(m[2]), int(m[3]))
    if m := re.search(r"\b(\d{1,2})/(\d{1,2})(?:/(\d{4}))?\b", t):
        return date(int(m[3] or today.year), int(m[2]), int(m[1]))
    if "apres-demain" in t or "apres demain" in t:
        return today + timedelta(days=2)
    if "demain" in t:
        return today + timedelta(days=1)
    if "hier" in t:
        return today - timedelta(days=1)
    for i, name in enumerate(WEEKDAYS):
        if re.search(rf"\b{name}\b", t):
            return today + timedelta(days=(i - today.weekday()) % 7)  # aujourd'hui si c'est ce jour-là
    if "aujourd" in t or "ce jour" in t:
        return today
    return None


def visites_du_jour(db: Session, user: User, jour: str = "aujourd'hui", delegue: str = "") -> ToolResult:
    """La tournée d'un jour : visites planifiées et réalisées, dans l'ordre de passage."""
    targets = _targets(db, user, delegue)
    day = parse_day(jour) or now().date()
    start = datetime.combine(day, datetime.min.time())
    visits = list(db.scalars(
        select(Visit).where(Visit.delegue_id.in_([t.id for t in targets]),
                            Visit.planned_at >= start, Visit.planned_at < start + timedelta(days=1))
        .order_by(Visit.planned_at)
    ))
    label = "aujourd'hui" if day == now().date() else "demain" if day == now().date() + timedelta(days=1) else f"le {WEEKDAYS[day.weekday()]} {fmt_date(day)}"
    many = len(targets) > 1

    def line(v: Visit) -> str:
        owner = f" ({v.delegue.name})" if many else ""
        return (f"{v.planned_at:%H:%M}, {v.doctor.full_name}, {v.doctor.specialty.lower()}, {v.doctor.district} ({v.doctor.city}), "
                f"{STATUS_LABELS.get(v.status, v.status)}{owner}")

    planned = sum(v.status == VisitStatus.PLANIFIEE for v in visits)
    if not visits:
        text = f"Aucune visite prévue {label}."
    else:
        text = f"{len(visits)} visites {label}, dont {planned} encore à faire :"
    data = {"jour": day.isoformat(), "nombre": len(visits), "a_faire": planned,
            "visites": [{"heure": f"{v.planned_at:%H:%M}", "medecin": v.doctor.full_name, "specialite": v.doctor.specialty,
                         "quartier": v.doctor.district, "ville": v.doctor.city, "statut": STATUS_LABELS.get(v.status, v.status),
                         "delegue": v.delegue.name} for v in visits]}
    citation = Citation(
        document_id=0, document_title="Vos données NOOR : planning", section=f"Journée du {fmt_date(day)}",
        excerpt=f"{len(visits)} visites prévues, {planned} encore planifiées.",
        link=f"/planning?vue=jour&date={day.isoformat()}",
    )
    return ToolResult(data, text, citation, [line(v) for v in visits])


def objectifs_du_mois(db: Session, user: User, delegue: str = "") -> ToolResult:
    """Avancement de l'objectif du mois (visites, couverture A, présentations par produit)."""
    targets = _targets(db, user, delegue)
    period = period_of(now().date())
    lines, data = [], []
    for t in targets:
        p = objective_service.get_progress(db, t.id, period)
        if p is None:
            lines.append(f"{t.name} : aucun objectif défini pour {period_label(period)}.")
            continue
        status = PROGRESS_LABELS.get(p.status, p.status)
        lines.append(
            f"{'Vous avez' if t.id == user.id else t.name + ' a'} réalisé {p.done_visits} visites sur {p.target_visits} "
            f"({fmt_pct(p.visits_pct)}, {fmt_pct(p.expected_pct)} attendus à date) : {status}. "
            f"Couverture des médecins A : {fmt_pct(p.coverage_a)} pour un objectif de {p.target_coverage_a} %."
        )
        data.append({"delegue": t.name, **p.model_dump(include={"target_visits", "done_visits", "visits_pct", "expected_pct",
                                                                "coverage_a", "target_coverage_a", "status"}),
                     "produits": [x.model_dump(include={"brand_name", "target", "done"}) for x in p.products]})
    text = lines[0] if len(lines) == 1 else f"Objectifs de {period_label(period)} :"
    citation = Citation(document_id=0, document_title="Vos données NOOR : objectifs", section=period_label(period).capitalize(),
                        excerpt=lines[0] if len(lines) == 1 else f"{len(data)} délégués avec un objectif ce mois-ci.",
                        link="/objectifs")
    return ToolResult({"mois": period_label(period), "objectifs": data}, text, citation, lines if len(lines) > 1 else [])


def comptes_rendus_en_attente(db: Session, user: User, delegue: str = "") -> ToolResult:
    """Visites passées encore « planifiées » : le compte-rendu reste à rédiger."""
    targets = _targets(db, user, delegue)
    current = now()
    visits = list(db.scalars(
        select(Visit).where(Visit.delegue_id.in_([t.id for t in targets]), Visit.status == VisitStatus.PLANIFIEE,
                            Visit.planned_at < current).order_by(Visit.planned_at)
    ))
    late = [v for v in visits if v.planned_at < current - timedelta(hours=48)]
    many = len(targets) > 1
    if not visits:
        text = "Aucun compte-rendu en attente : tout est à jour."
    else:
        text = (f"{len(visits)} comptes-rendus en attente, dont {len(late)} en retard de plus de 48 heures. "
                "Ouvrez la visite dans le planning puis « Rédiger le compte-rendu » :")
    lines = [f"{v.doctor.full_name}, visite du {fmt_date(v.planned_at)} à {v.planned_at:%H:%M}"
             + (f" ({v.delegue.name})" if many else "") for v in visits[:8]]
    data = {"nombre": len(visits), "en_retard_48h": len(late),
            "visites": [{"medecin": v.doctor.full_name, "date": v.planned_at.isoformat(timespec="minutes"),
                         "delegue": v.delegue.name} for v in visits[:8]]}
    citation = Citation(document_id=0, document_title="Vos données NOOR : comptes-rendus", section="En attente",
                        excerpt=f"{len(visits)} en attente, {len(late)} en retard de plus de 48 heures.",
                        link="/tableau-de-bord")
    return ToolResult(data, text, citation, lines)


# ---------------------------------------------------------------------------
# Description des outils pour Claude (format « tool use » de l'API)
# ---------------------------------------------------------------------------

_DELEGUE = {"type": "string", "description": "Prénom ou nom d'un délégué si la question porte sur un collègue "
                                             "précis ; chaîne vide pour l'utilisateur lui-même (ou toute son équipe s'il est superviseur)."}

TOOLS: dict[str, tuple[Callable[..., ToolResult], dict]] = {
    "indicateurs_activite": (indicateurs_activite, {
        "description": "Indicateurs d'activité d'un mois : CPA (fréquence respectée), CPA F1 et F2, couverture de la cible, "
                       "moyenne de visites par jour, visites réalisées, jours travaillés, nombre de médecins ciblés.",
        "properties": {"mois": {"type": "string", "enum": ["courant", "precedent"]}, "delegue": _DELEGUE},
    }),
    "medecins_a_voir": (medecins_a_voir, {
        "description": "Médecins ciblés (F1 ou F2) qui n'ont pas encore eu toutes leurs visites du mois en cours "
                       "(F1 : 1 visite, F2 : 2 visites), triés par priorité, avec leur prochaine visite planifiée.",
        "properties": {"frequence": {"type": "string", "enum": ["F1", "F2", "tous"]}, "delegue": _DELEGUE},
    }),
    "visites_du_jour": (visites_du_jour, {
        "description": "Tournée d'un jour : visites planifiées et réalisées, dans l'ordre, avec l'heure et le lieu.",
        "properties": {"jour": {"type": "string", "description": "Date au format AAAA-MM-JJ, ou « aujourd'hui », « demain », "
                                                                 "ou un jour de la semaine (« lundi »...)."},
                       "delegue": _DELEGUE},
    }),
    "objectifs_du_mois": (objectifs_du_mois, {
        "description": "Avancement de l'objectif du mois en cours : visites réalisées / objectif, rythme attendu à date, "
                       "couverture des médecins A, présentations par produit.",
        "properties": {"delegue": _DELEGUE},
    }),
    "comptes_rendus_en_attente": (comptes_rendus_en_attente, {
        "description": "Visites passées dont le compte-rendu n'a pas encore été rédigé (et celles en retard de plus de 48 h).",
        "properties": {"delegue": _DELEGUE},
    }),
}


def tool_definitions() -> list[dict]:
    return [
        {"name": name, "description": spec["description"], "strict": True,
         "input_schema": llm.strict_object(spec["properties"])}
        for name, (_, spec) in TOOLS.items()
    ]


def run_tool(db: Session, user: User, name: str, args: dict) -> ToolResult:
    """Exécute un outil ; un refus d'accès devient une ToolError (message pour le délégué)."""
    fn, spec = TOOLS[name]
    # Seuls les paramètres connus passent (plus « focus », réservé aux règles sans Claude)
    clean = {k: v for k, v in args.items() if k in spec["properties"] or k == "focus"}
    try:
        return fn(db, user, **clean)
    except HTTPException as exc:
        raise ToolError(str(exc.detail)) from exc


# ---------------------------------------------------------------------------
# Sans Claude : quel outil pour quelle question ? (mots-clés)
# ---------------------------------------------------------------------------

PATTERNS: list[tuple[str, str]] = [
    ("comptes_rendus_en_attente", r"(comptes?.?rendus?|\bcr\b).*(attente|retard|rediger|reste|manque|faire|pas encore)"
                                  r"|(attente|retard|rediger|reste).*(comptes?.?rendus?|\bcr\b)"),
    ("objectifs_du_mois", r"\bobjectifs?\b"),
    ("medecins_a_voir", r"(pas|jamais) (encore )?(vu|visite)|non (vus?|visites?)|a (voir|revoir|visiter)|reste a voir"
                        r"|qui (dois|doit|faut)|en retard de frequence|manque"),
    ("visites_du_jour", r"tournee|agenda|programme|planning|rendez.?vous|\brdv\b|visites? (prevues?|planifiees?)"
                        r"|(visites?|voir).*\b(aujourd|demain|lundi|mardi|mercredi|jeudi|vendredi|samedi)"),
    ("indicateurs_activite", r"\bcpa\b|couverture|moyenne|jours? travailles?|\bcalls?\b|contacts?|frequence respectee"
                             r"|indicateurs?|statistiques?|activite|combien de visites|nombre de visites|performance|resultats?"),
]

# Questions « mode d'emploi » : elles vont au guide, même si elles parlent de CPA ou de planning
HOWTO = re.compile(
    r"^(comment|ou (trouver|voir|se trouve|est |sont |puis|peut|faut|cliquer|ajouter|changer|modifier|saisir)|a quoi|c.?est quoi|qu.?est.?ce|que (signifie|veut dire|faire)|pourquoi|explique|definition|aide)"
    r"|comment (on |je |faire|calcul|est calcule|ajout|creer|planifi|amelior|utilis|marche|fonctionne|declar|signal"
    r"|modifi|supprim|annul|report|dict|redig|deplac|filtr|cherch|trouv|lire|interpret)"
)


def is_howto(question: str) -> bool:
    return bool(HOWTO.search(normalize(question).strip()))


def detect_tool(db: Session, user: User, question: str) -> tuple[str, dict] | None:
    """Choisit l'outil et ses paramètres à partir de mots-clés (None : ce n'est pas une question sur les données)."""
    q = normalize(question)
    name = next((n for n, pattern in PATTERNS if re.search(pattern, q)), None)
    if name is None:
        return None
    named = find_delegue(db, question)
    args: dict = {"delegue": named.name if named and named.id != user.id else ""}
    if name == "indicateurs_activite":
        args["mois"] = "precedent" if re.search(r"mois (dernier|precedent|passe)", q) else "courant"
        args["focus"] = next((k for k, w in (("cpa", "cpa"), ("couverture", "couverture"), ("moyenne", "moyenne")) if w in q), "cpa")
    elif name == "medecins_a_voir":
        args["frequence"] = "F2" if re.search(r"\bf2\b", q) else "F1" if re.search(r"\bf1\b", q) else "tous"
    elif name == "visites_du_jour":
        args["jour"] = question
    return name, args


# ---------------------------------------------------------------------------
# Point d'entrée
# ---------------------------------------------------------------------------

def _compose(results: list[ToolResult]) -> str:
    parts = []
    for r in results:
        parts.append(r.text + ("\n" + "\n".join(f"• {x}" for x in r.extra) if r.extra else ""))
    return "\n\n".join(parts)


def answer(db: Session, user: User, request: AskRequest, detected: tuple[str, dict] | None = None) -> AskResponse:
    """Répond à une question sur les données de l'utilisateur, en appelant les outils."""
    detected = detected or detect_tool(db, user, request.question)
    results: list[ToolResult] = []

    # 1. Avec Claude : il choisit lui-même les outils (et peut en appeler plusieurs)
    def execute(name: str, args: dict) -> str:
        if name not in TOOLS:
            return json.dumps({"erreur": f"outil inconnu : {name}"}, ensure_ascii=False)
        try:
            result = run_tool(db, user, name, args)
        except ToolError as exc:
            return json.dumps({"erreur": str(exc)}, ensure_ascii=False)
        results.append(result)
        return json.dumps(result.data, ensure_ascii=False, default=str)

    today = now().date()
    role = "superviseur (il voit les données de son équipe)" if user.role == Role.SUPERVISEUR else "délégué médical"
    claude = llm.run_tools(
        system=(
            "Tu es l'assistant du CRM pharmaceutique NOOR. Tu réponds aux questions d'un utilisateur sur SES données "
            "d'activité (CPA, couverture, médecins à voir, tournée, objectifs, comptes-rendus). Tu n'inventes jamais un "
            "chiffre : appelle toujours au moins un outil et utilise uniquement leurs résultats. Si un outil renvoie une "
            "erreur, explique-la simplement. Réponds en français, en 2 à 5 phrases simples, sans tableau ni markdown ; "
            "les dates au format « 16 oct. 2026 » et les pourcentages avec une virgule (« 62,5 % »)."
        ),
        prompt=f"Utilisateur : {user.name}, {role}. Nous sommes le {WEEKDAYS[today.weekday()]} {today.isoformat()}.\n\n"
               f"Question : {request.question}",
        tools=tool_definitions(),
        execute=execute,
    )
    if claude is not None and results:
        text, _ = claude
        return AskResponse(answer=text, citations=[r.citation for r in results], kind="donnees")

    # 2. Sans Claude (ou s'il n'a appelé aucun outil) : règles + phrases types
    results.clear()
    name, args = detected or ("indicateurs_activite", {"mois": "courant", "delegue": ""})
    try:
        result = run_tool(db, user, name, args)
    except ToolError as exc:
        return AskResponse(answer=str(exc), citations=[], refused=True, kind="donnees")
    return AskResponse(answer=_compose([result]), citations=[result.citation], kind="donnees")
