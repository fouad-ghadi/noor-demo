"""
╔══════════════════════════════════════════════════════════════════════╗
║  IA n°3 — PHARMACOVIGILANCE : détection d'effets indésirables        ║
║  Statut : implémenté (règles + Claude facultatif)                    ║
╚══════════════════════════════════════════════════════════════════════╝

Objectif
    Repérer dans les comptes-rendus (notes libres et commentaires d'objections)
    toute mention d'un effet indésirable survenu chez un patient, et créer une
    alerte « pharmacovigilance » pour que le délégué la déclare (obligation légale).

Deux méthodes de détection
    1. Règles (toujours disponibles, utilisées aussi pour analyser toute la base) :
       une phrase est retenue si elle contient
         - un SYMPTÔME connu (éruption, œdèmes, diarrhées, palpitations...),
         - un CAS réel chez un patient (« patient », « signale », « se plaint »...),
         - une EXPOSITION au produit (nom du produit, « sous », « après », « depuis »...),
       et AUCUNE marque de simple crainte (« craint », « inquiet », « risque »...).
       Exemple écarté : « Craint les œdèmes à forte dose » (une crainte, pas un cas).
    2. Claude (si ANTHROPIC_API_KEY est définie, voir app/ai/llm.py) : lit le texte
       et renvoie les signaux structurés. En cas d'échec, on revient aux règles.

Évaluation
    Le seed cache 7 comptes-rendus avec effet indésirable parmi ~4 000.
    Mesure : python scripts/evaluer_pharmacovigilance.py  (précision et rappel).

Automatisation
    `scan_visit` est appelé à chaque enregistrement de compte-rendu
    (fin de visit_service.submit_report) et `scan_all` à la fin du seed.
"""
import re
import unicodedata

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai import llm
from app.ai.schemas import AdverseEventSignal, PharmacovigilanceRequest, PharmacovigilanceResult
from app.models import Alert, Product, User, Visit
from app.models.enums import AlertSeverity, AlertStatus, AlertType, VisitStatus
from app.services import access

# --- Vocabulaire des règles ---------------------------------------------------------
# Les textes sont comparés en minuscules, sans accents (« œ » devient « oe »).

# Symptôme (motif recherché) → libellé de l'effet affiché dans l'alerte
SYMPTOMS: dict[str, str] = {
    r"eruption": "éruption cutanée",
    r"urticaire": "urticaire",
    r"demangeaison|prurit|7ekka|hekka": "démangeaisons",
    r"oedeme": "œdèmes",
    r"diarrhee": "diarrhées",
    r"nausee": "nausées",
    r"vomissement|t9iya|tqiya": "vomissements",
    r"constipation": "constipation",
    r"douleurs? musculaires?|myalgie|crampes?": "douleurs musculaires",
    r"douleurs? epigastriques?": "douleurs épigastriques",
    r"melena|hemorragie|saignement": "saignement digestif",
    r"palpitation": "palpitations",
    r"tremblement": "tremblements",
    r"vertige|etourdissement|dokha": "vertiges",
    r"cephalee|maux de tete": "maux de tête",
    r"hypoglycemie": "hypoglycémie",
    r"allergi|anaphyla": "réaction allergique",
    r"malaise": "malaise",
}
# Un cas réel chez un patient (et pas une généralité)
CASE_CUES = r"patient|patiente|enfant|bebe|maman|malade|signale|rapporte|se plaint|a presente|hospitalis|chez (un|une)"
# Exposition au produit (en plus du nom du produit, recherché à part)
EXPOSURE_CUES = r"\bsous\b|\bapres\b|\bdepuis\b|traitement|prise"
# Simple crainte ou hypothèse : ce n'est pas un effet constaté
FEAR_CUES = r"craint|crainte|inquiet|peur|risque|pourrait|eventuel|redoute"
# Signes de gravité (hospitalisation, urgence...)
SERIOUS_CUES = r"hospitalis|urgence|reanimation|deces|melena|hemorragie|anaphyla"


def normalize(text: str) -> str:
    """Minuscules, sans accents, « œ » → « oe » : pour comparer les mots facilement."""
    text = text.lower().replace("œ", "oe").replace("æ", "ae")
    return "".join(c for c in unicodedata.normalize("NFD", text) if unicodedata.category(c) != "Mn")


def _sentences(text: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[.!?;])\s+", text) if s.strip()]


def detect(text: str, products: list[Product] | None = None, use_llm: bool = True) -> list[AdverseEventSignal]:
    """Texte libre → signaux d'effets indésirables (Claude si disponible, sinon règles)."""
    if not text.strip():
        return []
    products = products or []
    if use_llm and llm.is_available():
        signals = _detect_with_claude(text, products)
        if signals is not None:
            return signals
    return _detect_with_rules(text, products)


def _find_product(sentence_norm: str, products: list[Product]) -> Product | None:
    """Le produit cité dans la phrase (nom commercial ou molécule), s'il y en a un."""
    for p in products:
        molecule = normalize(p.molecule.split(" ")[0])
        if normalize(p.brand_name) in sentence_norm or molecule in sentence_norm:
            return p
    return None


def _detect_with_rules(text: str, products: list[Product]) -> list[AdverseEventSignal]:
    signals: list[AdverseEventSignal] = []
    for sentence in _sentences(text):
        s = normalize(sentence)
        events = [label for pattern, label in SYMPTOMS.items() if re.search(pattern, s)]
        if not events or not re.search(CASE_CUES, s) or re.search(FEAR_CUES, s):
            continue
        product = _find_product(s, products)
        if product is None and not re.search(EXPOSURE_CUES, s):
            continue
        signals.append(
            AdverseEventSignal(
                product_id=product.id if product else None,
                product_name=product.brand_name if product else None,
                event=", ".join(dict.fromkeys(events)),
                excerpt=sentence,
                seriousness="grave" if re.search(SERIOUS_CUES, s) else "non_grave",
                # Plus sûr quand le produit est nommé dans la phrase
                confidence=0.85 if product else 0.6,
            )
        )
    return signals


def _detect_with_claude(text: str, products: list[Product]) -> list[AdverseEventSignal] | None:
    signal_schema = llm.strict_object({
        "product_name": {"type": ["string", "null"]},
        "event": {"type": "string"},
        "excerpt": {"type": "string"},
        "seriousness": {"type": "string", "enum": ["non_grave", "grave"]},
        "confidence": {"type": "number"},
    })
    result = llm.ask_json(
        system=(
            "Tu es un assistant de pharmacovigilance pour un laboratoire pharmaceutique marocain. "
            "Tu lis le compte-rendu de visite d'un délégué médical et tu repères chaque effet indésirable "
            "RÉELLEMENT survenu chez un patient (pas une simple crainte ou une question du médecin). "
            "Grave = hospitalisation, urgence, mise en jeu du pronostic vital. "
            "L'extrait doit être recopié mot pour mot depuis le texte. Réponds en français."
        ),
        prompt=(
            f"Produits du laboratoire : {', '.join(f'{p.brand_name} ({p.molecule})' for p in products) or 'non précisés'}.\n\n"
            f"Compte-rendu :\n{text}\n\n"
            "Liste les effets indésirables constatés (liste vide s'il n'y en a aucun)."
        ),
        schema=llm.strict_object({"signals": {"type": "array", "items": signal_schema}}),
    )
    if result is None:
        return None
    by_name = {normalize(p.brand_name): p for p in products}
    signals = []
    for s in result["signals"]:
        product = by_name.get(normalize(s["product_name"] or ""))
        signals.append(
            AdverseEventSignal(
                product_id=product.id if product else None,
                product_name=product.brand_name if product else s["product_name"],
                event=s["event"],
                excerpt=s["excerpt"],
                seriousness=s["seriousness"],
                confidence=max(0.0, min(1.0, float(s["confidence"]))),
            )
        )
    return signals


# --- Analyse des visites et création des alertes ------------------------------------------

def visit_text(visit: Visit) -> str:
    """Texte analysé : notes libres + commentaires des objections."""
    parts = [visit.notes or ""] + [o.comment or "" for o in visit.objections]
    return " ".join(p.strip() for p in parts if p and p.strip())


def scan_visit(db: Session, visit: Visit, use_llm: bool = True) -> PharmacovigilanceResult:
    """Analyse une visite réalisée et crée une alerte (une seule par visite) si besoin."""
    all_products = list(db.scalars(select(Product)))
    signals = detect(visit_text(visit), all_products, use_llm=use_llm)
    # Produit non cité dans la phrase : on prend le premier produit présenté pendant la visite
    for s in signals:
        if s.product_id is None and visit.products:
            s.product_id = visit.products[0].product_id
            s.product_name = visit.products[0].product.brand_name
    alerts_created: list[int] = []
    already = db.scalar(
        select(Alert.id).where(Alert.type == AlertType.PHARMACOVIGILANCE, Alert.visit_id == visit.id)
    )
    if signals and not already:
        alert = _make_alert(visit, signals)
        db.add(alert)
        db.commit()
        alerts_created.append(alert.id)
    return PharmacovigilanceResult(signals=signals, alerts_created=alerts_created)


def _make_alert(visit: Visit, signals: list[AdverseEventSignal]) -> Alert:
    main = max(signals, key=lambda s: (s.seriousness == "grave", s.confidence))
    when = (visit.actual_at or visit.planned_at).strftime("%d/%m/%Y")
    gravity = "GRAVE, " if main.seriousness == "grave" else ""
    product = f" sous {main.product_name}" if main.product_name else ""
    return Alert(
        type=AlertType.PHARMACOVIGILANCE,
        severity=AlertSeverity.HAUTE,
        status=AlertStatus.NOUVELLE,
        title=f"Effet indésirable à déclarer : {main.event}{product}",
        message=(f"{gravity}visite du {when} chez {visit.doctor.full_name} : « {main.excerpt} »")[:500],
        delegue_id=visit.delegue_id,
        doctor_id=visit.doctor_id,
        visit_id=visit.id,
        # L'alerte date du compte-rendu (et pas du moment de l'analyse)
        created_at=visit.reported_at or visit.actual_at or visit.planned_at,
    )


def scan_all(db: Session) -> int:
    """Analyse tous les comptes-rendus avec les règles (rapide, sans appel à Claude). Renvoie le nombre d'alertes créées."""
    visits = db.scalars(select(Visit).where(Visit.status == VisitStatus.REALISEE))
    return sum(len(scan_visit(db, v, use_llm=False).alerts_created) for v in visits)


def scan(db: Session, user: User, request: PharmacovigilanceRequest) -> PharmacovigilanceResult:
    """Point d'entrée de l'API : analyse une visite (et crée l'alerte) ou un texte libre."""
    if request.visit_id is not None:
        visit = access.get_visit_or_403(db, user, request.visit_id)
        return scan_visit(db, visit)
    return PharmacovigilanceResult(signals=detect(request.text or "", list(db.scalars(select(Product)))))
