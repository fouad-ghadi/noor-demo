"""
Routes des fonctionnalités IA (/api/ai/...).

Chaque route appelle la fonction du module correspondant dans app/ai/.
Tant que la fonction lève `NotImplementedError`, la route renvoie
« 501 Not Implemented » avec un message clair. Dès qu'elle est implémentée,
la route fonctionne : il n'y a rien d'autre à modifier ici.
"""
from collections.abc import Callable
from datetime import date
from typing import TypeVar

from fastapi import APIRouter, HTTPException

from app.ai import (
    FEATURES,
    card_scanner,
    closing,
    llm,
    pharmacovigilance,
    potential,
    rag_assistant,
    recommendations,
    sales_insights,
    visit_prep,
    week_planner,
    voice_report,
)
from app.ai.schemas import (
    AskRequest,
    AskResponse,
    CardScanRequest,
    CardScanResult,
    ClosingReport,
    DuplicateCheckRequest,
    DuplicateMatch,
    MergeProposal,
    MergeRequest,
    PharmacovigilanceRequest,
    PharmacovigilanceResult,
    PotentialApply,
    PotentialAssessment,
    SalesInsights,
    WeekPlan,
    WeekPlanConfirm,
    VisitPreparation,
    VisitRecommendation,
    VoiceReportRequest,
    VoiceReportResult,
)
from app.api.deps import DB, CurrentUser
from app.services import access, duplicate_service

router = APIRouter(prefix="/ai", tags=["IA (à venir)"])

T = TypeVar("T")

# Une seule ligne de réponse 501 documentée dans /docs pour toutes les routes
NOT_READY = {501: {"description": "Fonctionnalité IA pas encore implémentée"}}


def _run(feature: str, fn: Callable[[], T]) -> T:
    """Exécute la fonction IA ; transforme NotImplementedError en réponse HTTP 501."""
    try:
        return fn()
    except NotImplementedError as exc:
        raise HTTPException(
            status_code=501,
            detail={
                "feature": feature,
                "message": "Bientôt disponible : cette fonctionnalité IA n'est pas encore implémentée.",
                "module": FEATURES[feature],
                "reason": str(exc),
            },
        ) from exc


def _is_implemented(feature: str) -> bool:
    """Teste si un module IA est implémenté (appel « à blanc » de sa fonction principale)."""
    probes: dict[str, Callable[[], object]] = {
        "voice_report": lambda: voice_report.transcribe(""),
        "rag_assistant": lambda: rag_assistant.answer(None, None, None),  # type: ignore[arg-type]
        "pharmacovigilance": lambda: pharmacovigilance.detect(""),
        "card_scanner": lambda: card_scanner.extract_fields(""),
        "recommendations": lambda: recommendations.recommend(None, None),  # type: ignore[arg-type]
    }
    try:
        probes[feature]()
    except NotImplementedError:
        return False
    except Exception:  # noqa: BLE001 — implémenté mais l'appel à blanc échoue : c'est normal
        return True
    return True


@router.get("/status")
def ai_status():
    """Quelles fonctionnalités IA sont disponibles ? (le frontend s'en servira pour activer les boutons)"""
    status = {name: {"implemented": _is_implemented(name), "module": path} for name, path in FEATURES.items()}
    # Carte de visite : le serveur lit-il lui-même les photos (Claude vision) ?
    # Sinon le navigateur fait l'OCR et n'envoie que le texte.
    status["card_scanner"]["vision"] = llm.is_available()
    return status


@router.post("/voice-report", response_model=VoiceReportResult, responses=NOT_READY)
def ai_voice_report(data: VoiceReportRequest, db: DB, user: CurrentUser):
    """🎤 Dictée vocale → brouillon de compte-rendu (darija / français)."""
    access.get_visit_or_403(db, user, data.visit_id)
    return _run("voice_report", lambda: voice_report.voice_report(db, user, data))


@router.post("/assistant/ask", response_model=AskResponse, responses=NOT_READY)
def ai_assistant_ask(data: AskRequest, db: DB, user: CurrentUser):
    """💬 Question produit → réponse issue des documents validés, avec citations."""
    return _run("rag_assistant", lambda: rag_assistant.answer(db, user, data))


@router.post("/pharmacovigilance/scan", response_model=PharmacovigilanceResult, responses=NOT_READY)
def ai_pharmacovigilance(data: PharmacovigilanceRequest, db: DB, user: CurrentUser):
    """⚠️ Détection d'effets indésirables dans un compte-rendu (ou un texte)."""
    if data.visit_id is not None:
        access.get_visit_or_403(db, user, data.visit_id)
    return _run("pharmacovigilance", lambda: pharmacovigilance.scan(db, user, data))


@router.post("/card-scanner", response_model=CardScanResult, responses=NOT_READY)
def ai_card_scanner(data: CardScanRequest, db: DB, user: CurrentUser):
    """📷 Photo de carte de visite → fiche médecin pré-remplie + doublons possibles."""
    return _run("card_scanner", lambda: card_scanner.scan_card(db, user, data))


@router.post("/card-scanner/duplicates", response_model=list[DuplicateMatch])
def ai_card_duplicates(data: DuplicateCheckRequest, db: DB, user: CurrentUser):
    """🔁 Doublons possibles d'une fiche en cours de saisie (carte scannée ou saisie à la main)."""
    return card_scanner.find_duplicates(db, user, data, exclude_id=data.exclude_id)


@router.post("/card-scanner/merge", response_model=MergeProposal)
def ai_card_merge(data: MergeRequest, db: DB, user: CurrentUser):
    """🔁 « Compléter la fiche existante » : fiche fusionnée proposée (rien n'est enregistré)."""
    return duplicate_service.merge_proposal(db, user, data.doctor_id, data.card.model_dump())


@router.get("/recommendations", response_model=list[VisitRecommendation], responses=NOT_READY)
def ai_recommendations(db: DB, user: CurrentUser, delegue_id: int | None = None, limit: int = 10):
    """✨ Visites recommandées : quels médecins, quand, avec quels produits."""
    # Délégué : ses propres recommandations. Superviseur : celles du délégué demandé (ou toute l'équipe).
    target = delegue_id if delegue_id is not None else (user.id if user.role == "delegue" else None)
    if target is not None:
        access.check_delegue_access(db, user, target)
    return _run("recommendations", lambda: recommendations.recommend(db, user, target, limit))


@router.get("/potential/review", response_model=list[PotentialAssessment])
def ai_potential_review(db: DB, user: CurrentUser, delegue_id: int | None = None, limit: int = 50):
    """🅰️ Médecins dont le potentiel ou la fréquence de visite sont à revoir (avec le pourquoi)."""
    return potential.to_review(db, user, delegue_id, limit)


@router.get("/potential/{doctor_id}", response_model=PotentialAssessment)
def ai_potential(doctor_id: int, db: DB, user: CurrentUser):
    """🅰️ Potentiel A/B/C proposé pour un médecin, fréquence de visite conseillée et explication."""
    return potential.assess_doctor(db, user, doctor_id)


@router.post("/potential/{doctor_id}/apply", response_model=PotentialAssessment)
def ai_potential_apply(doctor_id: int, data: PotentialApply, db: DB, user: CurrentUser):
    """✅ Le délégué valide : la fiche prend le potentiel et la fréquence choisis."""
    return potential.apply(db, user, doctor_id, data.segment, data.frequency)


@router.get("/visit-prep/{doctor_id}", response_model=VisitPreparation)
def ai_visit_prep(doctor_id: int, db: DB, user: CurrentUser):
    """📋 Préparer la visite : dernier compte-rendu, produits à pousser (score + pourquoi), argument, échantillons."""
    return visit_prep.prepare(db, user, doctor_id)


@router.get("/week-plan", response_model=WeekPlan)
def ai_week_plan(db: DB, user: CurrentUser, start: date | None = None, delegue_id: int | None = None):
    """🗓️ « Remplir ma semaine » : visites proposées par quartier, les jours de réception (rien n'est enregistré)."""
    return week_planner.plan_week(db, user, start, delegue_id)


@router.post("/week-plan/confirm")
def ai_week_plan_confirm(data: WeekPlanConfirm, db: DB, user: CurrentUser) -> dict:
    """✅ Le délégué valide les visites cochées : elles sont ajoutées à son planning."""
    return {"planned": week_planner.confirm(db, user, data.visits)}


@router.get("/sales-insights", response_model=SalesInsights)
def ai_sales_insights(db: DB, user: CurrentUser, delegue_id: int | None = None):
    """📈 Ce que NOOR déduit des ventes : zones à prioriser, produits en croissance, médecins à revoir."""
    return sales_insights.insights(db, user, delegue_id)


@router.get("/closing/day", response_model=ClosingReport)
def ai_close_day(db: DB, user: CurrentUser, day: date | None = None):
    """🌙 Clôturer ma journée : points à régler et rapport rédigé automatiquement (à relire)."""
    return closing.close_day(db, user, day)


@router.get("/closing/month", response_model=ClosingReport)
def ai_close_month(db: DB, user: CurrentUser, period: str | None = None):
    """📅 Clôturer mon mois : indicateurs du rapport mensuel et objectifs, rapport rédigé (à relire)."""
    return closing.close_month(db, user, period)
