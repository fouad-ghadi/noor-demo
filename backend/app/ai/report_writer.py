"""
╔══════════════════════════════════════════════════════════════════════╗
║  IA n°11 — COMPTE-RENDU STRUCTURÉ + ÉCRAN DE VÉRIFICATION             ║
║  Statut : implémenté (rédaction par règles, aucune clé nécessaire)    ║
╚══════════════════════════════════════════════════════════════════════╝

Après la saisie rapide (puces, phrases prédéfinies, dictée), le délégué clique
« Vérifier le compte-rendu ». NOOR rédige un compte-rendu STRUCTURÉ, en rubriques :
    Contexte · Produits présentés · Réaction du médecin · Objections · Échantillons
    · Observations · Suite à donner
et liste les points à vérifier AVANT l'enregistrement :
    - échantillon remis sans numéro de lot (traçabilité) ;
    - objection sans réponse prévue dans la suite à donner ;
    - effet indésirable ou situation particulière repéré dans les notes (déclaration sous 24 h) ;
    - accueil réservé sans suite à donner.

Le délégué modifie librement le texte, puis valide : le texte final est enregistré avec la visite
(`Visit.report_summary`). Rien n'est enregistré par cette fonction.
"""
from datetime import date, datetime

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai import pharmacovigilance
from app.models import Product, User
from app.models.enums import OBJECTION_CATEGORIES
from app.schemas.visit import VisitReport
from app.services import access

MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre",
          "novembre", "décembre"]
FEEDBACK = {
    "tres_favorable": "très favorable", "favorable": "favorable", "neutre": "neutre",
    "reserve": "réservé", "defavorable": "défavorable",
}
PRESCRIPTION = {
    "prescrit_regulierement": "dit prescrire régulièrement",
    "prescrit_parmi_autres": "dit prescrire parmi d'autres produits",
    "promesse_prescrire": "promet de prescrire",
    "ne_prescrit_pas": "ne prescrit pas pour le moment",
}


class ReportSection(BaseModel):
    label: str
    text: str


class ReportCheck(BaseModel):
    level: str          # "attention" (à corriger de préférence) ou "info"
    text: str


class StructuredReport(BaseModel):
    title: str
    sections: list[ReportSection]
    summary: str                 # texte complet, modifiable par le délégué
    checks: list[ReportCheck]    # points à vérifier avant d'enregistrer


def _fmt_day(d: date) -> str:
    return f"{d.day} {MONTHS[d.month - 1]} {d.year}"


def _join(items: list[str]) -> str:
    return items[0] if len(items) == 1 else ", ".join(items[:-1]) + " et " + items[-1]


def structure(db: Session, user: User, visit_id: int, data: VisitReport) -> StructuredReport:
    visit = access.get_visit_or_403(db, user, visit_id)
    doctor = visit.doctor
    products = {p.id: p for p in db.scalars(select(Product))}
    when: datetime = data.actual_at or visit.planned_at
    presented = [products[i].brand_name for i in data.product_ids if i in products]

    sections: list[ReportSection] = []
    sections.append(ReportSection(
        label="Contexte",
        text=(f"Visite chez {doctor.full_name} ({doctor.specialty}, potentiel {doctor.segment}"
              + (f", ciblage {doctor.frequency}" if doctor.frequency else "")
              + f"), {doctor.district}, le {_fmt_day(when.date())} à {when:%H:%M}, durée {data.duration_min} min."),
    ))
    sections.append(ReportSection(label="Produits présentés", text=_join(presented) + "." if presented else "Aucun."))

    reaction = f"Accueil {FEEDBACK.get(data.feedback, data.feedback)}."
    if data.prescription_feedback:
        reaction += f" Le médecin {PRESCRIPTION.get(data.prescription_feedback, data.prescription_feedback)}."
    sections.append(ReportSection(label="Réaction du médecin", text=reaction))

    if data.objections:
        lines = []
        for o in data.objections:
            label = OBJECTION_CATEGORIES.get(o.category, o.category)
            if o.product_id in products:
                label += f" ({products[o.product_id].brand_name})"
            comment = (o.comment or "").strip().rstrip(".")
            lines.append(label + (f" : {comment}" if comment else ""))
        sections.append(ReportSection(label="Objections", text=" ; ".join(lines) + "."))

    if data.samples:
        parts = [f"{s.quantity} × {products[s.product_id].brand_name}"
                 + (f" (lot {s.lot_number})" if s.lot_number else " (lot à préciser)")
                 for s in data.samples if s.product_id in products]
        sections.append(ReportSection(label="Échantillons remis", text=_join(parts) + "."))

    if data.notes and data.notes.strip():
        notes = data.notes.strip()
        sections.append(ReportSection(label="Observations", text=notes if notes.endswith((".", "!", "?")) else notes + "."))

    follow = []
    if data.next_step and data.next_step.strip():
        follow.append(data.next_step.strip().rstrip(".") + ".")
    if data.next_visit_date:
        follow.append(f"Prochaine visite prévue le {_fmt_day(data.next_visit_date)}.")
    sections.append(ReportSection(label="Suite à donner", text=" ".join(follow) or "Non précisée."))

    # Points à vérifier avant d'enregistrer
    checks: list[ReportCheck] = []
    for s in data.samples:
        if not s.lot_number and s.product_id in products:
            checks.append(ReportCheck(level="attention",
                                      text=f"N° de lot manquant pour les échantillons de {products[s.product_id].brand_name} "
                                           "(obligatoire pour la traçabilité)."))
    if data.objections and not (data.next_step or "").strip():
        checks.append(ReportCheck(level="attention",
                                  text="Une objection a été notée mais aucune suite n'est prévue pour y répondre."))
    if data.feedback in ("reserve", "defavorable") and not (data.next_step or "").strip():
        checks.append(ReportCheck(level="info", text="Accueil réservé : prévoir un argument ou un document pour la prochaine visite."))
    text = " ".join(filter(None, [data.notes, data.next_step] + [o.comment or "" for o in data.objections]))
    for signal in pharmacovigilance.detect(text, list(products.values()), use_llm=False)[:1]:
        checks.append(ReportCheck(
            level="attention",
            text=(f"Pharmacovigilance : « {signal.excerpt.strip()} » ressemble à "
                  + ("un effet indésirable" if signal.kind == "effet_indesirable" else "une situation particulière")
                  + ". Après l'enregistrement, une déclaration pré-remplie vous sera proposée (à faire sous 24 h)."),
        ))
    if not checks:
        checks.append(ReportCheck(level="info", text="Rien à signaler : le compte-rendu est complet."))

    summary = "\n".join(f"{s.label} : {s.text}" for s in sections)
    return StructuredReport(title=f"Compte-rendu, {doctor.full_name}", sections=sections, summary=summary, checks=checks)
