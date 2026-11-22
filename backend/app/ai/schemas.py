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
    page: int | None = None  # numéro de page (PDF) ou de section (fiche texte)
    section: str | None = None  # titre de la section citée (ex. « Posologie et mode d'administration »)
    excerpt: str  # passage exact du document qui justifie la réponse
    # Page de l'application où vérifier l'information (ex. « /statistiques »), pour les réponses sur vos chiffres
    link: str | None = None


class AskResponse(BaseModel):
    answer: str
    citations: list[Citation]
    # True si aucun document validé ne permet de répondre : l'assistant le dit
    # explicitement au lieu d'inventer.
    refused: bool = False
    # D'où vient la réponse : "produit" (RCP validés), "guide" (mode d'emploi du CRM)
    # ou "donnees" (vos chiffres, calculés par les outils de app/ai/crm_data.py)
    kind: str = "produit"


# --- Pharmacovigilance -------------------------------------------------------------
class PharmacovigilanceRequest(BaseModel):
    visit_id: int | None = None
    text: str | None = None  # analyser un texte libre (tests)


class AdverseEventSignal(BaseModel):
    product_id: int | None
    product_name: str | None
    event: str               # ex. « éruption cutanée » ou « surdosage »
    excerpt: str             # phrase du compte-rendu qui mentionne l'effet
    seriousness: str         # "non_grave" | "grave" (hospitalisation, etc.)
    confidence: float        # 0 → 1
    # "effet_indesirable" ou "situation_particuliere" (enums.PvCaseKind)
    kind: str = "effet_indesirable"
    # Situations particulières repérées (codes enums.PvSituation), ex. ["grossesse_allaitement"]
    situations: list[str] = []
    # Ce qui permet d'identifier le patient (âge, sexe, initiales), None si rien
    patient: str | None = None
    # True si le produit est nommé dans la phrase (sinon déduit des produits présentés)
    product_in_text: bool = True


class PharmacovigilanceResult(BaseModel):
    signals: list[AdverseEventSignal]
    alerts_created: list[int] = []  # ids des alertes « pharmacovigilance » créées


# --- Scan de carte de visite ---------------------------------------------------
class CardScanRequest(BaseModel):
    # Photo de la carte (base64, sans le préfixe « data:... »), lue par Claude (vision) si une clé est configurée
    image_base64: str | None = None
    media_type: str = "image/jpeg"  # "image/jpeg" | "image/png" | "image/webp"
    # Texte de la carte déjà lu par l'OCR du navigateur (Tesseract.js) : utilisé sans clé d'API
    raw_text: str | None = None


class CardFields(BaseModel):
    """Champs lus sur une carte : tous facultatifs (une carte ne dit pas tout)."""
    first_name: str = ""
    last_name: str = ""
    specialty: str | None = None      # une des spécialités du référentiel (SPECIALTIES)
    practice_type: str | None = None  # cabinet / clinique / hopital_public
    address: str = ""
    city: str | None = None
    district: str | None = None
    phone: str | None = None
    email: str | None = None


class DuplicateMatch(BaseModel):
    doctor_id: int
    doctor_name: str
    specialty: str
    city: str
    district: str
    phone: str | None
    delegue_name: str        # délégué qui suit déjà ce médecin
    in_scope: bool           # False : fiche d'un collègue (pas d'accès à la fiche détaillée)
    score: float             # 0 → 1 (1 = certainement le même médecin)
    level: str               # "tres_probable" | "probable" | "possible"
    reasons: list[str]       # ex. ["même téléphone", "nom proche : Ouazzani / Wazzani"]


class CardScanResult(BaseModel):
    raw_text: str
    doctor: CardFields       # champs extraits, pour pré-remplir le formulaire
    duplicates: list[DuplicateMatch]
    method: str              # "claude" (vision) | "regles" (OCR du navigateur + règles) | "aucune"
    # True : le serveur n'a pas pu lire l'image (pas de clé) → le navigateur doit faire l'OCR
    # puis renvoyer le texte dans `raw_text`
    needs_ocr: bool = False
    uncertain_fields: list[str] = []  # champs devinés (ex. ville déduite de l'indicatif téléphonique)


class DuplicateCheckRequest(CardFields):
    exclude_id: int | None = None  # en modification : ne pas se comparer à soi-même


class MergeRequest(BaseModel):
    """« Compléter la fiche existante » avec les informations de la carte."""
    doctor_id: int
    card: CardFields


class FieldChange(BaseModel):
    field: str
    label: str               # libellé français (« Téléphone »)
    old: str | None
    new: str | None
    action: str              # "ajout" (champ vide complété) | "remplacement" | "conserve" (graphie différente gardée)


class MergeProposal(BaseModel):
    doctor_id: int
    fields: DoctorBase       # fiche existante complétée : le délégué relit puis enregistre
    changes: list[FieldChange]


# --- Recommandations -------------------------------------------------------------
class VisitRecommendation(BaseModel):
    doctor_id: int
    doctor_name: str
    suggested_date: date
    suggested_slot: str      # "matin" | "midi" | "apres_midi"
    product_ids: list[int]   # produits à présenter en priorité
    reasons: list[str]       # explications lisibles (ex. « médecin ciblé F2 non visité depuis 19 jours »)
    score: float
