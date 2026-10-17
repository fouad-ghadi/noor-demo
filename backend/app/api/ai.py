"""
Routes des fonctionnalités IA (/api/ai/...).

Chaque route appelle la fonction du module correspondant dans app/ai/.
Tant que la fonction lève `NotImplementedError`, la route renvoie
« 501 Not Implemented » avec un message clair. Dès qu'elle est implémentée,
la route fonctionne : il n'y a rien d'autre à modifier ici.
"""
from collections.abc import Callable
from typing import TypeVar

from fastapi import APIRouter, HTTPException

from app.ai import FEATURES, card_scanner, pharmacovigilance, rag_assistant, recommendations, voice_report
from app.ai.schemas import (
    AskRequest,
    AskResponse,
    CardScanRequest,
    CardScanResult,
    PharmacovigilanceRequest,
    PharmacovigilanceResult,
    VisitRecommendation,
    VoiceReportRequest,
    VoiceReportResult,
)
from app.api.deps import DB, CurrentUser
from app.services import access

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
        "card_scanner": lambda: card_scanner.read_card(""),
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
    return {name: {"implemented": _is_implemented(name), "module": path} for name, path in FEATURES.items()}


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


@router.get("/recommendations", response_model=list[VisitRecommendation], responses=NOT_READY)
def ai_recommendations(db: DB, user: CurrentUser, delegue_id: int | None = None, limit: int = 10):
    """✨ Visites recommandées : quels médecins, quand, avec quels produits."""
    # Délégué : ses propres recommandations. Superviseur : celles du délégué demandé (ou toute l'équipe).
    target = delegue_id if delegue_id is not None else (user.id if user.role == "delegue" else None)
    if target is not None:
        access.check_delegue_access(db, user, target)
    return _run("recommendations", lambda: recommendations.recommend(db, user, target, limit))
