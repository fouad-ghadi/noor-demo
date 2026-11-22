"""Schémas des cas de pharmacovigilance (déclaration sous 24 h)."""
from datetime import datetime

from pydantic import BaseModel, Field


class PvMinimumInfo(BaseModel):
    """Une des 4 informations minimales exigées par la procédure de déclaration."""
    key: str             # "produit" | "evenement" | "patient" | "notificateur"
    label: str           # ex. « Patient identifiable »
    found: bool          # trouvée dans le compte-rendu (ou complétée par le délégué)
    value: str | None    # ce qui a été trouvé
    hint: str | None = None  # quoi faire si l'information manque ou est à confirmer


class PvDeadline(BaseModel):
    """Délai de 24 h depuis la visite (prise de connaissance de l'information)."""
    known_at: datetime
    deadline_at: datetime
    # "a_temps" | "urgent" (moins de 6 h) | "en_retard" | "declaree_a_temps" | "declaree_en_retard"
    state: str
    minutes_left: int    # négatif quand le délai est dépassé (0 une fois déclarée)


class PvCaseSummary(BaseModel):
    """Résumé affiché dans la liste des alertes du tableau de bord."""
    id: int
    status: str          # enums.PvCaseStatus
    kind: str            # enums.PvCaseKind
    deadline: PvDeadline
    missing: list[str]   # libellés des informations minimales manquantes


class PvDeclarationDraft(BaseModel):
    """Déclaration pré-remplie (e-mail à l'équipe de pharmacovigilance)."""
    to: str
    subject: str
    body: str


class PvCaseOut(BaseModel):
    id: int
    alert_id: int | None
    visit_id: int
    delegue_id: int
    delegue_name: str
    doctor_id: int
    doctor_name: str
    product_id: int | None
    product_name: str | None
    product_in_text: bool
    kind: str
    event: str
    situations: list[str]   # codes enums.PvSituation
    seriousness: str
    excerpt: str
    patient_details: str | None
    status: str
    deadline: PvDeadline
    declared_at: datetime | None
    declared_by_name: str | None
    minimum_info: list[PvMinimumInfo]
    complete: bool          # les 4 informations sont présentes
    declarable: bool        # au minimum le produit et l'effet / la situation (procédure)
    declaration: PvDeclarationDraft


class PvDeclarationIn(BaseModel):
    """Ce que le délégué complète avant d'envoyer la déclaration."""
    patient_details: str | None = Field(default=None, max_length=200)  # ex. « homme, 45 ans, initiales A.B. »
    additional_info: str | None = Field(default=None, max_length=1000)  # évolution, traitement arrêté...
