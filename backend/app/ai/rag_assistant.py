"""
╔══════════════════════════════════════════════════════════════════════╗
║  IA n°2 — ASSISTANT PRODUIT (RAG avec citations)                     ║
║  Statut : à implémenter                                              ║
╚══════════════════════════════════════════════════════════════════════╝

Objectif
    Répondre aux questions des délégués sur les produits (posologie,
    contre-indications, interactions...) UNIQUEMENT à partir des documents
    validés (RCP, notices, supports approuvés), en citant la source.
    Si les documents ne permettent pas de répondre : le dire (refused=True).
    C'est une exigence réglementaire : pas d'information hors documents approuvés.

Données
    - Les PDF sont déposés dans /docs/products/<Produit>/ (voir docs/products/README.md).
    - La table `documents` (app.models.Document) liste les documents par produit ;
      renseigner `file_path` quand le PDF est déposé.

Pipeline proposé
    1. `index_documents()` : lire les PDF (pypdf / pdfplumber), découper en passages
       (en gardant document_id + numéro de page), calculer des embeddings
       (modèle multilingue), stocker dans un index (FAISS, Chroma...).
    2. `answer()` : rechercher les passages pertinents (filtrés sur le produit du
       contexte si présent), demander au LLM de répondre en citant les passages,
       renvoyer `AskResponse` avec les citations.

Côté frontend
    Panneau « Assistant NOOR » : frontend/src/components/assistant/AssistantPanel.tsx.
    Il reçoit déjà le contexte de la page (médecin, visite, produit affichés).
"""
from sqlalchemy.orm import Session

from app.ai.schemas import AskRequest, AskResponse
from app.models import User


def index_documents(db: Session) -> int:
    """(Ré)indexe les documents produits. Renvoie le nombre de passages indexés. À implémenter."""
    raise NotImplementedError("Indexation des documents non implémentée")


def answer(db: Session, user: User, request: AskRequest) -> AskResponse:
    """Répond à une question à partir des documents validés, avec citations. À implémenter."""
    raise NotImplementedError("Assistant produit (RAG) non implémenté")
