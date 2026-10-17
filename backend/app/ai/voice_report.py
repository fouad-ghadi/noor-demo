"""
╔══════════════════════════════════════════════════════════════════════╗
║  IA n°1 — DICTÉE VOCALE DU COMPTE-RENDU (darija / français)          ║
║  Statut : à implémenter                                              ║
╚══════════════════════════════════════════════════════════════════════╝

Objectif
    Le délégué sort du cabinet et dicte son compte-rendu, souvent en darija
    mélangée de français (« l'docteur kan mzyan, 3jbo Cardiovex, walakin gal
    lia prix ghali… »). NOOR remplit le formulaire ; le délégué relit et valide.

Pipeline proposé
    1. `transcribe(audio)`        : speech-to-text (ex. Whisper / faster-whisper,
                                    modèle multilingue ; tester un modèle affiné darija).
    2. `extract_report(text)`     : un LLM transforme la transcription en `VisitReport`
                                    (produits présentés, objections, échantillons, suite...).
                                    Donner au modèle la liste des produits et des catégories
                                    d'objections (app.models.enums.OBJECTION_CATEGORIES).
    3. Le frontend pré-remplit le formulaire avec `draft` ; le délégué valide,
       ce qui appelle `visit_service.submit_report(..., report_source="dictee")`.
       → Ne JAMAIS enregistrer automatiquement sans relecture humaine.

Côté frontend
    Bouton « 🎤 Dicter le compte-rendu » (désactivé) dans
    frontend/src/pages/visits/VisitReportPage.tsx.
"""
from sqlalchemy.orm import Session

from app.ai.schemas import VoiceReportRequest, VoiceReportResult
from app.models import User


def transcribe(audio_base64: str, language_hint: str = "darija") -> str:
    """Audio (base64) → texte. À implémenter (Whisper, faster-whisper...)."""
    raise NotImplementedError("Transcription vocale non implémentée")


def extract_report(db: Session, user: User, visit_id: int, transcript: str) -> VoiceReportResult:
    """Transcription → brouillon de compte-rendu structuré (VisitReport). À implémenter."""
    raise NotImplementedError("Extraction du compte-rendu non implémentée")


def voice_report(db: Session, user: User, request: VoiceReportRequest) -> VoiceReportResult:
    """Point d'entrée appelé par l'API : transcription (si audio) puis extraction."""
    transcript = request.transcript or transcribe(request.audio_base64 or "", request.language_hint)
    return extract_report(db, user, request.visit_id, transcript)
