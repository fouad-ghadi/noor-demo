"""
╔══════════════════════════════════════════════════════════════════════╗
║  IA n°1 — DICTÉE VOCALE DU COMPTE-RENDU (darija / français)          ║
║  Statut : implémenté (règles + Claude facultatif)                    ║
╚══════════════════════════════════════════════════════════════════════╝

Objectif
    Le délégué sort du cabinet et dicte son compte-rendu, souvent en darija
    mélangée de français (« l'docteur kan mzyan, 3jbo Cardiovex, walakin gal
    lia prix ghali… »). NOOR remplit le formulaire ; le délégué relit et valide.

Pipeline
    1. Transcription (voix → texte) : faite DANS LE NAVIGATEUR par la reconnaissance
       vocale de Chrome (français ou arabe marocain), gratuite et sans serveur.
       Le texte reste modifiable : on peut aussi le taper ou le coller.
       Plus tard : un modèle serveur (Whisper affiné darija) via `transcribe`.
    2. Extraction (texte → formulaire) :
       - avec Claude (ANTHROPIC_API_KEY) : extraction structurée, darija comprise ;
       - sans clé : règles par mots-clés (noms des produits, « 3jbo », « ghali »,
         « jouj boites », « semaine jaya »...).
    3. Le formulaire est pré-rempli ; le délégué relit, corrige et valide
       → visit_service.submit_report(..., report_source="dictee").
       On n'enregistre JAMAIS automatiquement sans relecture humaine.
"""
import re
from datetime import date, timedelta

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai import llm
from app.ai.pharmacovigilance import normalize
from app.ai.schemas import VoiceReportRequest, VoiceReportResult
from app.models import Product, User, Visit
from app.models.enums import OBJECTION_CATEGORIES, VisitFeedback
from app.schemas.visit import ObjectionIn, SampleIn, VisitReport
from app.services import access

# --- Vocabulaire des règles (comparé sans accents, en minuscules) -------------------------

# Accueil du médecin : du plus négatif au plus positif (« ma 3jbouch » doit passer avant « 3jbo »)
FEEDBACK_PATTERNS: list[tuple[str, str]] = [
    (VisitFeedback.DEFAVORABLE, r"defavorable|ma 3jbou?ch|ma bgha(ch|sh)|refus|pas interesse|accueil froid|negatif"),
    (VisitFeedback.RESERVE, r"reserve|mitige|hesit|pas convaincu|machi mqtane3|mashi mqtane3|moyen"),
    (VisitFeedback.TRES_FAVORABLE, r"tres favorable|ktir mzyan|bezzaf mzyan|bzzaf mzyan|3jbo bz?zaf|enthousiaste|excellent"),
    (VisitFeedback.FAVORABLE, r"favorable|mzyan|3jbo|3ajbo|zwin|content|interesse|bon accueil|positif|ra[dt]i"),
    (VisitFeedback.NEUTRE, r"neutre|normal|3adi"),
]
# Objection (clé de OBJECTION_CATEGORIES) → mots qui la signalent
OBJECTION_PATTERNS: dict[str, str] = {
    "prix_eleve": r"\bprix\b|ghali|\bcher\b|tman",
    "prefere_generique": r"generique|jenerik",
    "concurrent_satisfaisant": r"concurrent|autre labo",
    # « besoin d'études » est une objection ; « apporter l'étude » est une suite à donner
    "etudes_locales": r"(besoin|demande|veut|bgha|khass).{0,30}etudes?|etudes? (locales|cliniques)",
    "effets_indesirables": r"effets? (indesirables?|secondaires?)|tolerance|khayf",
    "remboursement": r"rembours|\bamo\b|cnops|ramed",
    "disponibilite": r"rupture|disponib|introuvable|makaynch",
    "habitudes": r"habitude|m3a?wd",
    "posologie": r"posologie|forme|sirop|nombre de prises",
}
# Nombres écrits en lettres (français et darija)
NUMBER_WORDS = {
    "un": 1, "une": 1, "wahed": 1, "deux": 2, "jouj": 2, "zouj": 2, "trois": 3, "tlata": 3, "tleta": 3,
    "quatre": 4, "rb3a": 4, "arba3a": 4, "cinq": 5, "khamsa": 5, "six": 6, "stta": 6, "dix": 10, "3achra": 10,
}
NEXT_STEP_CUES = r"rja3|nrj3|nrja3|repasser|revenir|prochaine|prochain|jaya|apporter|relancer|inviter|n3awd"


def transcribe(audio_base64: str, language_hint: str = "darija") -> str:
    """
    Audio → texte. Dans NOOR, la transcription est faite par le navigateur (reconnaissance
    vocale de Chrome) : le frontend envoie directement le texte (`transcript`).
    """
    raise HTTPException(
        400,
        "La transcription se fait dans le navigateur : envoyez le texte dicté (champ « transcript »).",
    )


def _sentences(text: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[.!?;])\s+|\n+", text) if s.strip()]


def _products_in(text_norm: str, products: list[Product]) -> list[Product]:
    """Produits cités (nom commercial ou molécule), dans l'ordre d'apparition."""
    found = []
    for p in products:
        for name in (p.brand_name, p.molecule.split(" ")[0]):
            pos = text_norm.find(normalize(name))
            if pos >= 0:
                found.append((pos, p))
                break
    return [p for _, p in sorted(found, key=lambda x: x[0])]


def extract_with_rules(transcript: str, products: list[Product], visit: Visit) -> VoiceReportResult:
    text = normalize(transcript)
    uncertain: list[str] = []

    # Produits présentés (sinon : premier produit ciblant la spécialité, à vérifier)
    presented = _products_in(text, products)
    if not presented:
        targeted = [p for p in products if visit.doctor.specialty in p.target_specialties] or products
        presented = targeted[:1]
        uncertain.append("product_ids")

    # Accueil du médecin
    feedback = next((fb for fb, pattern in FEEDBACK_PATTERNS if re.search(pattern, text)), None)
    if feedback is None:
        feedback = VisitFeedback.NEUTRE
        uncertain.append("feedback")

    # Objections : la phrase qui contient le mot-clé devient le commentaire
    objections: dict[str, ObjectionIn] = {}
    for sentence in _sentences(transcript):
        s = normalize(sentence)
        cited = _products_in(s, presented)
        for category, pattern in OBJECTION_PATTERNS.items():
            if category not in objections and re.search(pattern, s):
                objections[category] = ObjectionIn(
                    category=category,
                    comment=sentence[:300],
                    product_id=cited[0].id if cited else (presented[0].id if len(presented) == 1 else None),
                )

    # Échantillons : « jouj boites de Cardiovex », « 3 échantillons »...
    samples: dict[int, int] = {}
    for sentence in _sentences(transcript):
        s = normalize(sentence)
        if not re.search(r"echantillon|boite|3ayyen|3ina", s):
            continue
        number = re.search(r"\b(\d{1,2})\b", s)
        word = next((NUMBER_WORDS[w] for w in re.findall(r"[a-z0-9]+", s) if w in NUMBER_WORDS), None)
        quantity = int(number[1]) if number else word or 2
        for p in _products_in(s, presented) or presented[:1]:
            samples[p.id] = max(1, min(50, quantity))

    # Durée de l'entretien
    # « 15 minutes », mais aussi « dqayq 15 » (en darija, le mot vient souvent avant le nombre)
    minutes = re.search(r"(\d{1,3})\s*(min|minutes|mn|dqay[q9]|d9ay[q9])", text) or re.search(
        r"(?:dqay[q9]|d9ay[q9]|minutes)\s*(\d{1,3})", text
    )
    duration = max(1, min(180, int(minutes[1]))) if minutes else 15
    if not minutes:
        uncertain.append("duration_min")

    # Suite à donner et date de la prochaine visite
    next_sentence = next((s for s in _sentences(transcript) if re.search(NEXT_STEP_CUES, normalize(s))), None)
    next_date = _next_visit_date(text)

    return VoiceReportResult(
        transcript=transcript,
        draft=VisitReport(
            duration_min=duration,
            product_ids=[p.id for p in presented],
            feedback=feedback,
            objections=list(objections.values()),
            samples=[SampleIn(product_id=pid, quantity=q) for pid, q in samples.items()],
            notes=transcript.strip()[:2000],
            next_step=next_sentence[:300] if next_sentence else None,
            next_visit_date=next_date,
            report_source="dictee",
        ),
        uncertain_fields=uncertain,
    )


def _next_visit_date(text_norm: str) -> date | None:
    today = date.today()
    if re.search(r"semaine (prochaine|jaya)|l'?semaine jaya|simana jaya", text_norm):
        return today + timedelta(days=7)
    if re.search(r"mois (prochain)|chher jay|chhar jay", text_norm):
        return today + timedelta(days=30)
    m = re.search(r"dans (\d{1,2}) (jours|semaines)", text_norm)
    if m:
        return today + timedelta(days=int(m[1]) * (7 if m[2] == "semaines" else 1))
    return None


def extract_with_claude(transcript: str, products: list[Product], visit: Visit) -> VoiceReportResult | None:
    names = [p.brand_name for p in products]
    result = llm.ask_json(
        system=(
            "Tu aides un délégué médical marocain à remplir le compte-rendu d'une visite chez un médecin. "
            "Il a dicté sa visite, souvent en darija (écrite en lettres latines ou arabes) mélangée de français. "
            "Extrais les informations du formulaire. N'invente rien : si une information n'est pas dite, "
            "laisse-la vide et cite le champ dans uncertain_fields. Les commentaires et notes sont en français."
        ),
        prompt=(
            f"Médecin : {visit.doctor.full_name}, {visit.doctor.specialty}.\n"
            f"Produits possibles : {', '.join(names)}.\n"
            f"Catégories d'objections : {', '.join(f'{k} ({v})' for k, v in OBJECTION_CATEGORIES.items())}.\n\n"
            f"Dictée :\n{transcript}"
        ),
        schema=llm.strict_object({
            "product_names": {"type": "array", "items": {"type": "string", "enum": names}},
            "feedback": {"type": ["string", "null"], "enum": [f.value for f in VisitFeedback] + [None]},
            "objections": {"type": "array", "items": llm.strict_object({
                "category": {"type": "string", "enum": list(OBJECTION_CATEGORIES)},
                "comment": {"type": "string"},
                "product_name": {"type": ["string", "null"]},
            })},
            "samples": {"type": "array", "items": llm.strict_object({
                "product_name": {"type": "string", "enum": names},
                "quantity": {"type": "integer"},
            })},
            "duration_min": {"type": ["integer", "null"]},
            "next_step": {"type": ["string", "null"]},
            "next_visit_in_days": {"type": ["integer", "null"]},
            "notes": {"type": "string"},
            "uncertain_fields": {"type": "array", "items": {"type": "string"}},
        }),
    )
    if result is None:
        return None
    by_name = {p.brand_name: p for p in products}
    presented = [by_name[n] for n in dict.fromkeys(result["product_names"]) if n in by_name]
    uncertain = list(result["uncertain_fields"])
    if not presented:
        presented = [p for p in products if visit.doctor.specialty in p.target_specialties][:1] or products[:1]
        uncertain.append("product_ids")
    feedback = result["feedback"]
    if feedback is None:
        feedback = VisitFeedback.NEUTRE
        uncertain.append("feedback")
    days = result["next_visit_in_days"]
    return VoiceReportResult(
        transcript=transcript,
        draft=VisitReport(
            duration_min=max(1, min(180, result["duration_min"] or 15)),
            product_ids=[p.id for p in presented],
            feedback=feedback,
            objections=[
                ObjectionIn(
                    category=o["category"],
                    comment=o["comment"][:300],
                    product_id=by_name[o["product_name"]].id if o["product_name"] in by_name else None,
                )
                for o in result["objections"]
            ],
            samples=[
                SampleIn(product_id=by_name[s["product_name"]].id, quantity=max(1, min(50, s["quantity"])))
                for s in result["samples"]
                if s["product_name"] in by_name
            ],
            notes=result["notes"][:2000] or transcript[:2000],
            next_step=result["next_step"],
            next_visit_date=date.today() + timedelta(days=days) if days and 0 < days <= 365 else None,
            report_source="dictee",
        ),
        uncertain_fields=list(dict.fromkeys(uncertain)),
    )


def extract_report(db: Session, user: User, visit_id: int, transcript: str) -> VoiceReportResult:
    """Transcription → brouillon de compte-rendu structuré (VisitReport), à relire par le délégué."""
    if not transcript.strip():
        raise HTTPException(400, "La dictée est vide : parlez ou tapez le compte-rendu.")
    visit = access.get_visit_or_403(db, user, visit_id)
    products = list(db.scalars(select(Product).order_by(Product.brand_name)))
    return extract_with_claude(transcript, products, visit) or extract_with_rules(transcript, products, visit)


def voice_report(db: Session, user: User, request: VoiceReportRequest) -> VoiceReportResult:
    """Point d'entrée appelé par l'API : transcription (si audio) puis extraction."""
    transcript = request.transcript or transcribe(request.audio_base64 or "", request.language_hint)
    return extract_report(db, user, request.visit_id, transcript)
