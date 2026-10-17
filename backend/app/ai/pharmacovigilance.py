"""
╔══════════════════════════════════════════════════════════════════════╗
║  IA n°3 — PHARMACOVIGILANCE : détection d'effets indésirables        ║
║  Statut : à implémenter                                              ║
╚══════════════════════════════════════════════════════════════════════╝

Objectif
    Repérer dans les comptes-rendus (champ `notes`, objections) toute mention
    d'un effet indésirable chez un patient, et créer une alerte de type
    « pharmacovigilance » pour que le délégué la déclare (obligation légale).

Données de test
    Le seed insère 7 comptes-rendus contenant un effet indésirable : leurs
    identifiants sont listés dans /seed_duplicates.md (section 2).
    Les autres comptes-rendus n'en contiennent pas : utile pour mesurer les faux positifs.

Pipeline proposé
    1. `detect(text)` : classification + extraction (LLM ou modèle NER biomédical) :
       quel produit, quel effet, quel extrait, gravité (hospitalisation = grave).
    2. `scan_visit(visit_id)` : appelle `detect` sur la visite, puis crée une
       `Alert(type="pharmacovigilance", severity="haute", visit_id=..., doctor_id=...)`.
       L'alerte apparaît alors automatiquement dans le tableau de bord du délégué.
    3. Plus tard : lancer `scan_visit` automatiquement à chaque compte-rendu
       (à la fin de `visit_service.submit_report`).
"""
from sqlalchemy.orm import Session

from app.ai.schemas import AdverseEventSignal, PharmacovigilanceRequest, PharmacovigilanceResult
from app.models import User


def detect(text: str) -> list[AdverseEventSignal]:
    """Texte libre → signaux d'effets indésirables. À implémenter."""
    raise NotImplementedError("Détection pharmacovigilance non implémentée")


def scan(db: Session, user: User, request: PharmacovigilanceRequest) -> PharmacovigilanceResult:
    """Analyse une visite (ou un texte) et crée les alertes correspondantes. À implémenter."""
    raise NotImplementedError("Analyse pharmacovigilance non implémentée")
