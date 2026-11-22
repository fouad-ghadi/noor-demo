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


class Frequency(StrEnum):
    """
    Fréquence de visite d'un médecin ciblé (« ciblage » fait deux fois par an, janvier et juillet) :
    F1 = une visite par mois, F2 = deux visites par mois. Un médecin sans fréquence est hors cible.
    """
    F1 = "F1"
    F2 = "F2"


# Nombre de visites attendues par mois selon la fréquence (sert au CPA, Call Plan Adherence)
VISITS_PER_MONTH = {Frequency.F1: 1, Frequency.F2: 2}


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


class PrescriptionFeedback(StrEnum):
    """Ce que le médecin dit de sa prescription pendant la visite (historique de la fiche)."""
    PRESCRIT_REGULIEREMENT = "prescrit_regulierement"
    PRESCRIT_PARMI_AUTRES = "prescrit_parmi_autres"
    PROMESSE_PRESCRIRE = "promesse_prescrire"
    NE_PRESCRIT_PAS = "ne_prescrit_pas"


class EventType(StrEnum):
    """
    Activités hors visites (agenda) : elles réduisent les jours travaillés sur le terrain.
    Les « jours travaillés » d'un délégué = jours ouvrés de la période − jours d'événements.
    """
    REUNION_EQUIPE = "reunion_equipe"
    FORMATION = "formation"
    CONGRES = "congres"
    STAFF = "staff"
    TABLE_RONDE = "table_ronde"
    ADMINISTRATIF = "administratif"
    CONGE_ANNUEL = "conge_annuel"
    CONGE_MALADIE = "conge_maladie"
    FETE = "fete"            # jour férié
    AUTRE = "autre"


class ReportSource(StrEnum):
    """Comment le compte-rendu a été saisi (« dictee » = futur assistant vocal)."""
    MANUEL = "manuel"
    DICTEE = "dictee"


class AlertType(StrEnum):
    MEDECIN_NON_VISITE = "medecin_non_visite"
    OBJECTIF_EN_RETARD = "objectif_en_retard"
    COMPTE_RENDU_EN_RETARD = "compte_rendu_en_retard"
    PHARMACOVIGILANCE = "pharmacovigilance"  # produite par app/ai/pharmacovigilance.py


class PvCaseKind(StrEnum):
    """Nature d'un cas de pharmacovigilance (procédure de déclaration du laboratoire)."""
    EFFET_INDESIRABLE = "effet_indesirable"
    SITUATION_PARTICULIERE = "situation_particuliere"  # même sans effet indésirable


class PvSituation(StrEnum):
    """
    « Situations particulières » à déclarer comme un effet indésirable,
    même si le patient n'a eu aucun symptôme.
    """
    GROSSESSE_ALLAITEMENT = "grossesse_allaitement"
    SURDOSAGE = "surdosage"
    MESUSAGE = "mesusage"                    # mauvais usage, abus, hors indication
    ERREUR_MEDICAMENTEUSE = "erreur_medicamenteuse"
    MANQUE_EFFICACITE = "manque_efficacite"


# Libellés des situations particulières (alertes, déclaration pré-remplie)
PV_SITUATION_LABELS: dict[str, str] = {
    PvSituation.GROSSESSE_ALLAITEMENT: "exposition pendant la grossesse ou l'allaitement",
    PvSituation.SURDOSAGE: "surdosage",
    PvSituation.MESUSAGE: "mésusage",
    PvSituation.ERREUR_MEDICAMENTEUSE: "erreur médicamenteuse",
    PvSituation.MANQUE_EFFICACITE: "manque d'efficacité",
}


class PvCaseStatus(StrEnum):
    A_DECLARER = "a_declarer"
    DECLAREE = "declaree"


# Délai réglementaire de déclaration à l'équipe de pharmacovigilance (procédure du laboratoire)
PV_DEADLINE_HOURS = 24
# Adresse fictive de l'équipe de pharmacovigilance (démo : jamais la vraie adresse du partenaire)
PV_TEAM_EMAIL = "pharmacovigilance@noor-demo.ma"


class AlertSeverity(StrEnum):
    FAIBLE = "faible"
    MOYENNE = "moyenne"
    HAUTE = "haute"


class AlertStatus(StrEnum):
    NOUVELLE = "nouvelle"
    VUE = "vue"
    TRAITEE = "traitee"


class BusinessUnit(StrEnum):
    """Unité commerciale d'un produit (comme dans les rapports d'activité des laboratoires)."""
    CHRONIQUE = "chronique"
    AIGUE = "aigue"


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
