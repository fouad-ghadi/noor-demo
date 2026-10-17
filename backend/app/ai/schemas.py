"""
Formats d'entrée / sortie des modules IA (le « contrat » entre le frontend,
l'API et les modules). Modifiez-les en équipe : le frontend en dépend.
"""
from datetime import date

from pydantic import BaseModel, Field

from app.schemas.doctor import DoctorBase
from app.schemas.visit import VisitReport


# --- Dictée vocale -----------------------------------------------------------
class VoiceReportRequest(BaseModel):
    visit_id: int
    # Audio encodé en base64 (webm/ogg/wav enregistré par le navigateur).
    # Variante possible plus tard : envoi multipart (UploadFile + paquet python-multipart).
    audio_base64: str | None = None
    # Ou bien une transcription déjà faite (utile pour tester l'extraction seule)
    transcript: str | None = None
    language_hint: str = "darija"  # "darija" | "fr" | "auto"


class VoiceReportResult(BaseModel):
    transcript: str
    # Compte-rendu pré-rempli, que le délégué RELIT et valide dans le formulaire
    draft: VisitReport
    # Champs pour lesquels le modèle n'est pas sûr (à surligner dans le formulaire)
    uncertain_fields: list[str] = []


# --- Assistant produit (RAG) ---------------------------------------------------
class AssistantContext(BaseModel):
    """Contexte de la page courante (envoyé par le panneau « Assistant NOOR »)."""
    page: str
    doctor_id: int | None = None
    visit_id: int | None = None
    product_id: int | None = None


class AskRequest(BaseModel):
    question: str = Field(min_length=2)
    context: AssistantContext | None = None


class Citation(BaseModel):
    document_id: int
    document_title: str
    page: int | None = None
    excerpt: str  # passage exact du document qui justifie la réponse


class AskResponse(BaseModel):
    answer: str
    citations: list[Citation]
    # True si aucun document validé ne permet de répondre : l'assistant le dit
    # explicitement au lieu d'inventer.
    refused: bool = False


# --- Pharmacovigilance -------------------------------------------------------------
class PharmacovigilanceRequest(BaseModel):
    visit_id: int | None = None
    text: str | None = None  # analyser un texte libre (tests)


class AdverseEventSignal(BaseModel):
    product_id: int | None
    product_name: str | None
    event: str               # ex. « éruption cutanée »
    excerpt: str             # phrase du compte-rendu qui mentionne l'effet
    seriousness: str         # "non_grave" | "grave" (hospitalisation, etc.)
    confidence: float        # 0 → 1


class PharmacovigilanceResult(BaseModel):
    signals: list[AdverseEventSignal]
    alerts_created: list[int] = []  # ids des alertes « pharmacovigilance » créées


# --- Scan de carte de visite ---------------------------------------------------
class CardScanRequest(BaseModel):
    image_base64: str


class DuplicateMatch(BaseModel):
    doctor_id: int
    doctor_name: str
    score: float             # 0 → 1 (1 = certainement le même médecin)
    reasons: list[str]       # ex. ["même téléphone", "nom proche : Ouazzani / Wazzani"]


class CardScanResult(BaseModel):
    raw_text: str
    doctor: DoctorBase       # champs extraits, pour pré-remplir le formulaire
    duplicates: list[DuplicateMatch]


# --- Recommandations -------------------------------------------------------------
class VisitRecommendation(BaseModel):
    doctor_id: int
    doctor_name: str
    suggested_date: date
    suggested_slot: str      # "matin" | "midi" | "apres_midi"
    product_ids: list[int]   # produits à présenter en priorité
    reasons: list[str]       # explications lisibles (ex. « segment A non vu depuis 45 jours »)
    score: float
