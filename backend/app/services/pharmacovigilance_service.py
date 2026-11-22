"""
Déclaration des cas de pharmacovigilance (procédure réelle d'un laboratoire).

Les cas sont créés par le module IA (app/ai/pharmacovigilance.py) quand un compte-rendu
mentionne un effet indésirable ou une situation particulière. Ce service :

1. vérifie les 4 INFORMATIONS MINIMALES d'une déclaration :
     - un produit du laboratoire,
     - un effet indésirable ou une situation particulière,
     - un patient identifiable (âge, sexe ou initiales, jamais le nom complet),
     - un notificateur identifiable (ici, le médecin rencontré).
   À défaut des 4, la procédure accepte une déclaration avec au moins les deux premières :
   le délégué la complète ensuite auprès du médecin.
2. calcule le DÉLAI DE 24 H (depuis la visite) : à temps, urgent (< 6 h), en retard ;
3. prépare la DÉCLARATION PRÉ-REMPLIE (e-mail à l'équipe de pharmacovigilance) ;
4. enregistre la déclaration (« Marquer comme déclarée ») et clôt l'alerte liée.

L'IA propose, le délégué relit et envoie : rien n'est transmis automatiquement.
"""
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import Alert, PharmacovigilanceCase, User
from app.models.enums import (
    PV_SITUATION_LABELS,
    PV_TEAM_EMAIL,
    AlertStatus,
    PvCaseKind,
    PvCaseStatus,
)
from app.schemas.pharmacovigilance import (
    PvCaseOut,
    PvCaseSummary,
    PvDeadline,
    PvDeclarationDraft,
    PvDeclarationIn,
    PvMinimumInfo,
)
from app.services import access
from app.services.dates import now

# En dessous de 6 h restantes, le délai est affiché comme « urgent »
URGENT_MINUTES = 6 * 60
# Texte mis à la place d'une information manquante dans la déclaration
TO_COMPLETE = "À COMPLÉTER"


# --- 1. Les 4 informations minimales --------------------------------------------------

def minimum_info(case: PharmacovigilanceCase, patient_details: str | None = None) -> list[PvMinimumInfo]:
    """État des 4 informations minimales (patient_details : saisie éventuelle du délégué)."""
    patient = (patient_details or case.patient_details or "").strip() or None
    doctor = case.doctor
    product = case.product
    return [
        PvMinimumInfo(
            key="produit",
            label="Produit du laboratoire",
            found=product is not None,
            value=f"{product.brand_name} ({product.molecule})" if product else None,
            hint=None if product is None or case.product_in_text
            else "Produit déduit des produits présentés pendant la visite : à confirmer avec le médecin.",
        ),
        PvMinimumInfo(
            key="evenement",
            label="Effet indésirable ou situation particulière",
            found=bool(case.event),
            value=case.event,
        ),
        PvMinimumInfo(
            key="patient",
            label="Patient identifiable",
            found=patient is not None,
            value=patient,
            hint=None if patient else "Demandez au médecin l'âge, le sexe ou les initiales du patient (jamais son nom).",
        ),
        PvMinimumInfo(
            key="notificateur",
            label="Notificateur identifiable",
            found=doctor is not None,
            value=f"{doctor.full_name}, {doctor.specialty}, {doctor.city}" if doctor else None,
        ),
    ]


def is_declarable(infos: list[PvMinimumInfo]) -> bool:
    """La procédure exige au minimum le produit et l'effet (ou la situation)."""
    found = {i.key for i in infos if i.found}
    return {"produit", "evenement"} <= found


# --- 2. Le délai de 24 h ---------------------------------------------------------------

def deadline_state(case: PharmacovigilanceCase, at: datetime | None = None) -> PvDeadline:
    """Où en est le délai de déclaration de 24 h, à l'instant `at` (maintenant par défaut)."""
    at = at or now()
    if case.status == PvCaseStatus.DECLAREE and case.declared_at:
        late = case.declared_at > case.deadline_at
        return PvDeadline(
            known_at=case.known_at,
            deadline_at=case.deadline_at,
            state="declaree_en_retard" if late else "declaree_a_temps",
            minutes_left=0,
        )
    minutes_left = int((case.deadline_at - at).total_seconds() // 60)
    if minutes_left < 0:
        state = "en_retard"
    elif minutes_left < URGENT_MINUTES:
        state = "urgent"
    else:
        state = "a_temps"
    return PvDeadline(known_at=case.known_at, deadline_at=case.deadline_at, state=state, minutes_left=minutes_left)


# --- 3. La déclaration pré-remplie -----------------------------------------------------

def build_declaration(case: PharmacovigilanceCase, data: PvDeclarationIn | None = None) -> PvDeclarationDraft:
    """Rédige l'e-mail de déclaration à partir du cas et des compléments du délégué."""
    data = data or PvDeclarationIn()
    infos = {i.key: i for i in minimum_info(case, data.patient_details)}
    is_event = case.kind == PvCaseKind.EFFET_INDESIRABLE
    nature = "Effet indésirable" if is_event else "Situation particulière"
    product_name = case.product.brand_name if case.product else TO_COMPLETE
    doctor = case.doctor
    delegue = case.delegue

    product_line = infos["produit"].value or TO_COMPLETE
    if infos["produit"].hint:
        product_line += " (déduit des produits présentés, à confirmer)"
    situations = ", ".join(PV_SITUATION_LABELS.get(c, c) for c in case.situation_codes)
    doctor_line = (
        f"{doctor.full_name}, {doctor.specialty}, {doctor.address}, {doctor.city}"
        + (f", tél. {doctor.phone}" if doctor.phone else "")
    )
    lines = [
        "Bonjour,",
        "",
        "Je vous transmets une déclaration de pharmacovigilance recueillie lors d'une visite médicale.",
        "",
        f"1. Produit concerné : {product_line}",
        f"2. {nature} : {case.event}",
    ]
    if situations and is_event:
        lines.append(f"   Situation(s) particulière(s) : {situations}")
    lines += [
        f"   Gravité : {'GRAVE (hospitalisation, urgence ou pronostic vital)' if case.seriousness == 'grave' else 'non grave'}",
        f"   Propos rapportés par le médecin : « {case.excerpt} »",
        f"3. Patient : {infos['patient'].value or TO_COMPLETE + ' (âge, sexe ou initiales)'}",
        f"4. Notificateur : {doctor_line}",
        "",
        f"Date de prise de connaissance : {case.known_at:%d/%m/%Y à %H:%M} (visite médicale)",
        f"Date limite de déclaration (24 h) : {case.deadline_at:%d/%m/%Y à %H:%M}",
    ]
    if data.additional_info and data.additional_info.strip():
        lines.append(f"Informations complémentaires : {data.additional_info.strip()}")
    lines += [
        "",
        "Cordialement,",
        f"{delegue.name}, délégué médical ({delegue.region})",
        delegue.email + (f", tél. {delegue.phone}" if delegue.phone else ""),
    ]
    return PvDeclarationDraft(
        to=PV_TEAM_EMAIL,
        subject=f"[Pharmacovigilance] {nature} : {case.event} sous {product_name} (visite du {case.known_at:%d/%m/%Y})",
        body="\n".join(lines),
    )


# --- Conversion pour l'API --------------------------------------------------------------

def to_summary(case: PharmacovigilanceCase, at: datetime | None = None) -> PvCaseSummary:
    return PvCaseSummary(
        id=case.id,
        status=case.status,
        kind=case.kind,
        deadline=deadline_state(case, at),
        missing=[i.label for i in minimum_info(case) if not i.found],
    )


def to_out(case: PharmacovigilanceCase) -> PvCaseOut:
    infos = minimum_info(case)
    if case.status == PvCaseStatus.DECLAREE and case.declaration_text:
        # Une fois déclarée : on montre exactement ce qui a été envoyé
        subject, _, body = case.declaration_text.partition("\n\n")
        declaration = PvDeclarationDraft(to=PV_TEAM_EMAIL, subject=subject, body=body)
    else:
        declaration = build_declaration(case)
    return PvCaseOut(
        id=case.id,
        alert_id=case.alert_id,
        visit_id=case.visit_id,
        delegue_id=case.delegue_id,
        delegue_name=case.delegue.name,
        doctor_id=case.doctor_id,
        doctor_name=case.doctor.full_name,
        product_id=case.product_id,
        product_name=case.product.brand_name if case.product else None,
        product_in_text=case.product_in_text,
        kind=case.kind,
        event=case.event,
        situations=case.situation_codes,
        seriousness=case.seriousness,
        excerpt=case.excerpt,
        patient_details=case.patient_details,
        status=case.status,
        deadline=deadline_state(case),
        declared_at=case.declared_at,
        declared_by_name=case.declared_by.name if case.declared_by else None,
        minimum_info=infos,
        complete=all(i.found for i in infos),
        declarable=is_declarable(infos),
        declaration=declaration,
    )


# --- Lecture et déclaration -------------------------------------------------------------

def _query():
    return select(PharmacovigilanceCase).options(
        selectinload(PharmacovigilanceCase.doctor),
        selectinload(PharmacovigilanceCase.product),
        selectinload(PharmacovigilanceCase.delegue),
        selectinload(PharmacovigilanceCase.declared_by),
    )


def summaries_by_alert(db: Session, alert_ids: list[int]) -> dict[int, PvCaseSummary]:
    """Résumés des cas liés à ces alertes (pour la liste des alertes du tableau de bord)."""
    if not alert_ids:
        return {}
    at = now()
    cases = db.scalars(_query().where(PharmacovigilanceCase.alert_id.in_(alert_ids)))
    return {c.alert_id: to_summary(c, at) for c in cases}


def is_declared(db: Session, alert_id: int) -> bool:
    status = db.scalar(select(PharmacovigilanceCase.status).where(PharmacovigilanceCase.alert_id == alert_id))
    return status is None or status == PvCaseStatus.DECLAREE


def list_cases(db: Session, user: User, *, delegue_id: int | None = None, status: str | None = None) -> list[PvCaseOut]:
    """Cas visibles : à déclarer d'abord (échéance la plus proche en tête), puis déclarés (récents d'abord)."""
    delegue_ids = access.resolve_delegue_ids(db, user, delegue_id)
    q = _query().where(PharmacovigilanceCase.delegue_id.in_(delegue_ids))
    if status:
        q = q.where(PharmacovigilanceCase.status == status)
    cases = list(db.scalars(q))
    to_declare = sorted((c for c in cases if c.status != PvCaseStatus.DECLAREE), key=lambda c: c.deadline_at)
    declared = sorted((c for c in cases if c.status == PvCaseStatus.DECLAREE),
                      key=lambda c: c.declared_at or c.deadline_at, reverse=True)
    return [to_out(c) for c in to_declare + declared]


def get_case_or_403(db: Session, user: User, case_id: int) -> PharmacovigilanceCase:
    case = db.scalar(_query().where(PharmacovigilanceCase.id == case_id))
    if case is None:
        raise HTTPException(404, "Cas de pharmacovigilance introuvable")
    access.check_delegue_access(db, user, case.delegue_id)
    return case


def preview(db: Session, user: User, case_id: int, data: PvDeclarationIn) -> PvDeclarationDraft:
    """Aperçu de la déclaration avec les compléments saisis (ne modifie rien)."""
    return build_declaration(get_case_or_403(db, user, case_id), data)


def declare(db: Session, user: User, case_id: int, data: PvDeclarationIn) -> PvCaseOut:
    """« Marquer comme déclarée » : enregistre le texte envoyé, la date, et clôt l'alerte."""
    case = get_case_or_403(db, user, case_id)
    if user.id != case.delegue_id:
        raise HTTPException(403, "Seul le délégué qui a recueilli l'information peut la déclarer")
    if case.status == PvCaseStatus.DECLAREE:
        raise HTTPException(400, "Ce cas a déjà été déclaré")
    if data.patient_details and data.patient_details.strip():
        case.patient_details = data.patient_details.strip()
    if not is_declarable(minimum_info(case)):
        raise HTTPException(400, "Il faut au minimum le produit et l'effet (ou la situation) pour déclarer")
    draft = build_declaration(case, data)
    case.status = PvCaseStatus.DECLAREE
    case.declared_at = now()
    case.declared_by = user
    case.declaration_text = f"{draft.subject}\n\n{draft.body}"
    if case.alert_id:
        alert = db.get(Alert, case.alert_id)
        if alert is not None:
            alert.status = AlertStatus.TRAITEE
    db.commit()
    return to_out(case)

