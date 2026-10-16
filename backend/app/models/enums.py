"""
Valeurs autorisées (énumérations) utilisées par les modèles.

On stocke en base des codes courts sans accents (ex. "realisee") ;
les libellés affichés en français (ex. "Réalisée") sont gérés par le frontend
(fichier frontend/src/lib/labels.ts) et par l'endpoint /api/meta.
"""
from enum import StrEnum


class Role(StrEnum):
    DELEGUE = "delegue"
    SUPERVISEUR = "superviseur"


class PracticeType(StrEnum):
    CABINET = "cabinet"
    CLINIQUE = "clinique"
    HOPITAL_PUBLIC = "hopital_public"


class Segment(StrEnum):
    """Potentiel du médecin : A = fort, B = moyen, C = faible."""
    A = "A"
    B = "B"
    C = "C"


class PrescribingStatus(StrEnum):
    NON_PRESCRIPTEUR = "non_prescripteur"
    OCCASIONNEL = "occasionnel"
    REGULIER = "regulier"


class TimeSlot(StrEnum):
    """Créneau de visite préféré du médecin."""
    MATIN = "matin"            # 9h – 12h
    MIDI = "midi"              # 12h – 14h
    APRES_MIDI = "apres_midi"  # 14h – 19h


class DoctorSource(StrEnum):
    """Origine de la fiche médecin (utile pour le futur scan de cartes de visite)."""
    MANUEL = "manuel"
    CARTE_DE_VISITE = "carte_de_visite"
    IMPORT = "import"


class VisitStatus(StrEnum):
    PLANIFIEE = "planifiee"
    REALISEE = "realisee"
    ANNULEE = "annulee"
    REPORTEE = "reportee"


class VisitFeedback(StrEnum):
    """Accueil / retour global du médecin pendant la visite."""
    TRES_FAVORABLE = "tres_favorable"
    FAVORABLE = "favorable"
    NEUTRE = "neutre"
    RESERVE = "reserve"
    DEFAVORABLE = "defavorable"


class ReportSource(StrEnum):
    """Comment le compte-rendu a été saisi (« dictee » = futur assistant vocal)."""
    MANUEL = "manuel"
    DICTEE = "dictee"


class AlertType(StrEnum):
    MEDECIN_NON_VISITE = "medecin_non_visite"
    OBJECTIF_EN_RETARD = "objectif_en_retard"
    COMPTE_RENDU_EN_RETARD = "compte_rendu_en_retard"
    PHARMACOVIGILANCE = "pharmacovigilance"  # sera produite par app/ai/pharmacovigilance.py


class AlertSeverity(StrEnum):
    FAIBLE = "faible"
    MOYENNE = "moyenne"
    HAUTE = "haute"


class AlertStatus(StrEnum):
    NOUVELLE = "nouvelle"
    VUE = "vue"
    TRAITEE = "traitee"


class DocumentType(StrEnum):
    RCP = "rcp"                                    # Résumé des Caractéristiques du Produit
    NOTICE = "notice"
    SUPPORT_PROMOTIONNEL = "support_promotionnel"


# Catégories d'objections les plus fréquentes sur le terrain.
# Le délégué choisit une ou plusieurs catégories + un commentaire libre.
OBJECTION_CATEGORIES: dict[str, str] = {
    "prix_eleve": "Prix trop élevé",
    "prefere_generique": "Le patient préfère le générique",
    "concurrent_satisfaisant": "Pas de rupture chez le concurrent",
    "etudes_locales": "Besoin d'études cliniques locales",
    "effets_indesirables": "Crainte d'effets indésirables",
    "remboursement": "Non remboursé / mal remboursé (AMO, CNOPS)",
    "disponibilite": "Disponibilité en pharmacie",
    "habitudes": "Habitudes de prescription installées",
    "posologie": "Posologie / forme peu pratique",
}

SPECIALTIES: list[str] = [
    "Généraliste",
    "Cardiologue",
    "Endocrinologue",
    "Pédiatre",
    "Gynécologue",
    "Pneumologue",
    "Gastro-entérologue",
    "Dermatologue",
    "Rhumatologue",
    "ORL",
]
