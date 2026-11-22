"""
╔══════════════════════════════════════════════════════════════════════╗
║  IA n°3 — PHARMACOVIGILANCE : effets indésirables et situations      ║
║  particulières, à déclarer sous 24 h                                 ║
║  Statut : implémenté (règles + Claude facultatif)                    ║
╚══════════════════════════════════════════════════════════════════════╝

Objectif (procédure réelle d'un laboratoire)
    Repérer dans les comptes-rendus (notes libres et commentaires d'objections) :
      - tout EFFET INDÉSIRABLE survenu chez un patient ;
      - toute SITUATION PARTICULIÈRE, à déclarer même sans effet : grossesse ou
        allaitement, surdosage, mésusage / abus, erreur médicamenteuse, manque d'efficacité.
    Pour chacun, le module crée un « cas » (models/pharmacovigilance.py) et une alerte :
    le délégué doit le déclarer à l'équipe de pharmacovigilance DANS LES 24 HEURES,
    avec les 4 informations minimales (produit, effet / situation, patient identifiable,
    notificateur identifiable). La déclaration est pré-remplie
    (services/pharmacovigilance_service.py) : le délégué la relit, la complète et l'envoie.

Deux méthodes de détection
    1. Règles (toujours disponibles, utilisées aussi pour analyser toute la base) :
       une phrase est retenue si elle contient
         - un SYMPTÔME connu (éruption, œdèmes, diarrhées...) OU une SITUATION particulière
           (« enceinte », « surdosage », « erreur de dispensation », « aucune amélioration »...),
         - un CAS réel chez un patient (« patient », « signale », « se plaint »...),
         - une EXPOSITION au produit (nom du produit, « sous », « après », « depuis »...),
       et AUCUNE marque de simple crainte (« craint », « inquiet », « risque »...).
       Exemple écarté : « Craint les œdèmes à forte dose » (une crainte, pas un cas).
       Le patient est « identifiable » si la phrase donne son âge, son sexe, sa tranche d'âge
       ou ses initiales (« une patiente de 34 ans », « un enfant de 7 ans »).
    2. Claude (si ANTHROPIC_API_KEY est définie, voir app/ai/llm.py) : lit le texte
       et renvoie les signaux structurés. En cas d'échec, on revient aux règles.

Évaluation
    Le seed cache 12 comptes-rendus à déclarer (7 effets indésirables + 5 situations
    particulières) parmi ~4 200. Mesure : python scripts/evaluer_pharmacovigilance.py
    Tests automatiques : python -m pytest  (dossier backend/tests).

Automatisation
    `scan_visit` est appelé à chaque enregistrement de compte-rendu
    (fin de visit_service.submit_report) et `scan_all` à la fin du seed.
"""
import re
import unicodedata
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai import llm
from app.ai.schemas import AdverseEventSignal, PharmacovigilanceRequest, PharmacovigilanceResult
from app.models import Alert, PharmacovigilanceCase, Product, User, Visit
from app.models.enums import (
    PV_DEADLINE_HOURS,
    PV_SITUATION_LABELS,
    AlertSeverity,
    AlertStatus,
    AlertType,
    PvCaseKind,
    PvCaseStatus,
    PvSituation,
    VisitStatus,
)
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
# Situations particulières : à déclarer MÊME SANS effet indésirable
SITUATIONS: dict[str, str] = {
    PvSituation.GROSSESSE_ALLAITEMENT: r"enceinte|grossesse|allaite|allaitement",
    PvSituation.SURDOSAGE: r"surdosage|surdose|overdose|intoxication|double dose|dose excessive"
                           r"|(pris|avale|prend) \d+ (comprimes|cp|gelules|sachets)",
    PvSituation.MESUSAGE: r"mesusage|mauvais usage|abus\b|detourne|hors amm|hors indication|sans avis medical",
    PvSituation.ERREUR_MEDICAMENTEUSE: r"erreur (medicamenteuse|de dispensation|de dosage|de posologie|de prescription)"
                                       r"|au lieu d[eu]\b|confusion entre|s'est trompe",
    PvSituation.MANQUE_EFFICACITE: r"inefficac|manque d'efficacite|aucune amelioration|pas d'amelioration"
                                   r"|sans amelioration|echec (therapeutique|du traitement)|n'a pas (agi|marche|fonctionne)",
}
# Pour une situation particulière (sans symptôme), on exige UN patient précis,
# pour ne pas confondre « une patiente enceinte » et « ses patientes enceintes » (généralité).
SINGLE_CASE_CUES = (r"\b(un|une|cette|ce|son|sa) (patient|patiente|enfant|bebe|nourrisson|malade|femme|homme)\b"
                    r"|\bchez (un|une)\b|signale|rapporte|hospitalis|a presente")
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


def patient_details(sentence: str) -> str | None:
    """
    Ce qui rend le patient « identifiable » dans la phrase : sexe, âge (ou tranche d'âge),
    initiales. Exemple : « une patiente de 34 ans » → « femme, 34 ans ». None si rien.
    """
    s = normalize(sentence)
    details: list[str] = []
    if re.search(r"\b(patiente|femme|enceinte|fille)\b", s):
        details.append("femme")
    elif re.search(r"\b(homme|monsieur|garcon)\b", s):
        details.append("homme")
    age = re.search(r"\b(\d{1,3}) (ans|mois)\b", s)
    if age:
        details.append(f"{age.group(1)} {age.group(2)}")
    elif re.search(r"\bages?\b|\bagees?\b|personnes? agee", s):
        details.append("patient âgé")
    if re.search(r"\b(enfant|bebe|nourrisson)\b", s) and not any("ans" in d or "mois" in d for d in details):
        details.append("enfant")
    elif re.search(r"\b(enfant|bebe|nourrisson)\b", s):
        details.insert(0, "enfant")
    initials = re.search(r"\b([A-Z])\.\s?([A-Z])\.", sentence)
    if initials:
        details.append(f"initiales {initials.group(1)}.{initials.group(2)}.")
    return ", ".join(details) or None


def _detect_with_rules(text: str, products: list[Product]) -> list[AdverseEventSignal]:
    signals: list[AdverseEventSignal] = []
    for sentence in _sentences(text):
        s = normalize(sentence)
        if re.search(FEAR_CUES, s):
            continue  # simple crainte : pas un cas constaté
        events = [label for pattern, label in SYMPTOMS.items() if re.search(pattern, s)]
        situations = [code for code, pattern in SITUATIONS.items() if re.search(pattern, s)]
        if events and not re.search(CASE_CUES, s):
            events = []
        if situations and not re.search(SINGLE_CASE_CUES, s):
            situations = []
        if not events and not situations:
            continue
        product = _find_product(s, products)
        if product is None and not re.search(EXPOSURE_CUES, s):
            continue
        signals.append(
            AdverseEventSignal(
                product_id=product.id if product else None,
                product_name=product.brand_name if product else None,
                event=", ".join(dict.fromkeys(events or [PV_SITUATION_LABELS[c] for c in situations])),
                excerpt=sentence,
                seriousness="grave" if re.search(SERIOUS_CUES, s) else "non_grave",
                # Plus sûr quand le produit est nommé dans la phrase
                confidence=0.85 if product else 0.6,
                kind=PvCaseKind.EFFET_INDESIRABLE if events else PvCaseKind.SITUATION_PARTICULIERE,
                situations=[str(c) for c in situations],
                patient=patient_details(sentence),
                product_in_text=product is not None,
            )
        )
    return signals


def _detect_with_claude(text: str, products: list[Product]) -> list[AdverseEventSignal] | None:
    signal_schema = llm.strict_object({
        "product_name": {"type": ["string", "null"]},
        "kind": {"type": "string", "enum": [k.value for k in PvCaseKind]},
        "event": {"type": "string"},
        "situations": {"type": "array", "items": {"type": "string", "enum": [c.value for c in PvSituation]}},
        "patient": {"type": ["string", "null"]},
        "excerpt": {"type": "string"},
        "seriousness": {"type": "string", "enum": ["non_grave", "grave"]},
        "confidence": {"type": "number"},
    })
    result = llm.ask_json(
        system=(
            "Tu es un assistant de pharmacovigilance pour un laboratoire pharmaceutique marocain. "
            "Tu lis le compte-rendu de visite d'un délégué médical et tu repères chaque cas à déclarer : "
            "un effet indésirable RÉELLEMENT survenu chez un patient (kind=effet_indesirable), ou une "
            "situation particulière même sans effet (kind=situation_particuliere) : grossesse ou allaitement, "
            "surdosage, mésusage ou abus, erreur médicamenteuse, manque d'efficacité. "
            "Ignore les simples craintes, questions ou généralités du médecin. "
            "Grave = hospitalisation, urgence, mise en jeu du pronostic vital. "
            "patient = ce qui identifie le patient (sexe, âge, initiales), null si rien. "
            "L'extrait doit être recopié mot pour mot depuis le texte. Réponds en français."
        ),
        prompt=(
            f"Produits du laboratoire : {', '.join(f'{p.brand_name} ({p.molecule})' for p in products) or 'non précisés'}.\n\n"
            f"Compte-rendu :\n{text}\n\n"
            "Liste les cas à déclarer (liste vide s'il n'y en a aucun)."
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
                kind=s["kind"],
                situations=s["situations"],
                patient=s["patient"],
                product_in_text=product is not None,
            )
        )
    return signals


# --- Analyse des visites et création des alertes ------------------------------------------

def visit_text(visit: Visit) -> str:
    """Texte analysé : notes libres + commentaires des objections."""
    parts = [visit.notes or ""] + [o.comment or "" for o in visit.objections]
    return " ".join(p.strip() for p in parts if p and p.strip())


def scan_visit(db: Session, visit: Visit, use_llm: bool = True) -> PharmacovigilanceResult:
    """Analyse une visite réalisée et crée le cas + l'alerte (un seul par visite) si besoin."""
    all_products = list(db.scalars(select(Product)))
    signals = detect(visit_text(visit), all_products, use_llm=use_llm)
    # Produit non cité dans la phrase : on prend le premier produit présenté pendant la visite
    for s in signals:
        if s.product_id is None and visit.products:
            s.product_id = visit.products[0].product_id
            s.product_name = visit.products[0].product.brand_name
            s.product_in_text = False
    alerts_created: list[int] = []
    already = db.scalar(
        select(Alert.id).where(Alert.type == AlertType.PHARMACOVIGILANCE, Alert.visit_id == visit.id)
    )
    if signals and not already:
        main = _main_signal(signals)
        case = _make_case(visit, main)
        alert = _make_alert(visit, main, case)
        db.add(alert)
        db.flush()  # pour obtenir alert.id
        case.alert_id = alert.id
        db.add(case)
        db.commit()
        alerts_created.append(alert.id)
    return PharmacovigilanceResult(signals=signals, alerts_created=alerts_created)


def _main_signal(signals: list[AdverseEventSignal]) -> AdverseEventSignal:
    """Le signal principal d'une visite : le plus grave, puis le plus sûr (les autres situations sont fusionnées)."""
    main = max(signals, key=lambda s: (s.seriousness == "grave", s.kind == PvCaseKind.EFFET_INDESIRABLE, s.confidence))
    main.situations = list(dict.fromkeys(c for s in signals for c in s.situations))
    main.patient = main.patient or next((s.patient for s in signals if s.patient), None)
    return main


def _make_case(visit: Visit, main: AdverseEventSignal) -> PharmacovigilanceCase:
    # Le délai de 24 h court depuis la visite (le moment où le délégué a reçu l'information)
    known_at = visit.actual_at or visit.planned_at
    return PharmacovigilanceCase(
        visit_id=visit.id,
        delegue_id=visit.delegue_id,
        doctor_id=visit.doctor_id,
        product_id=main.product_id,
        product_in_text=main.product_in_text,
        kind=main.kind,
        event=main.event[:200],
        situations=",".join(main.situations),
        seriousness=main.seriousness,
        excerpt=main.excerpt,
        patient_details=main.patient,
        known_at=known_at,
        deadline_at=known_at + timedelta(hours=PV_DEADLINE_HOURS),
        status=PvCaseStatus.A_DECLARER,
        created_at=visit.reported_at or known_at,
    )


def _make_alert(visit: Visit, main: AdverseEventSignal, case: PharmacovigilanceCase) -> Alert:
    when = (visit.actual_at or visit.planned_at).strftime("%d/%m/%Y")
    gravity = "GRAVE, " if main.seriousness == "grave" else ""
    product = f" sous {main.product_name}" if main.product_name else ""
    what = "Effet indésirable" if main.kind == PvCaseKind.EFFET_INDESIRABLE else "Situation particulière"
    return Alert(
        type=AlertType.PHARMACOVIGILANCE,
        severity=AlertSeverity.HAUTE,
        status=AlertStatus.NOUVELLE,
        title=f"{what} à déclarer : {main.event}{product}"[:200],
        message=(f"{gravity}à déclarer avant le {case.deadline_at:%d/%m/%Y à %H:%M}. "
                 f"Visite du {when} chez {visit.doctor.full_name} : « {main.excerpt} »")[:500],
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
