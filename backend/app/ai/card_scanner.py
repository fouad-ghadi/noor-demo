"""
╔══════════════════════════════════════════════════════════════════════╗
║  IA n°4 — SCAN DE CARTE DE VISITE + DÉTECTION DE DOUBLONS            ║
║  Statut : implémenté (Claude vision facultatif + OCR navigateur)     ║
╚══════════════════════════════════════════════════════════════════════╝

Objectif
    Le délégué photographie la carte de visite d'un médecin : NOOR remplit la fiche
    « Nouveau médecin » et signale si ce médecin existe déjà, même écrit autrement
    (Ouazzani / Wazzani, El Amrani / Elamrani, +212 522-251478 / 05 22 25 14 78).
    C'est la demande n° 3 du laboratoire partenaire.

Pipeline
    1. Lecture de la carte (image → champs) :
       - avec Claude (ANTHROPIC_API_KEY) : Claude lit directement la photo (vision) et renvoie
         un JSON (nom, prénom, spécialité, adresse, ville, quartier, téléphone, e-mail) ;
       - sans clé : le NAVIGATEUR lit le texte de la photo (OCR Tesseract.js, gratuit),
         puis `extract_fields` en tire les champs avec des règles (titre « Dr », mots-clés
         de spécialité, formats de téléphone marocains, noms de villes et de quartiers).
    2. Doublons : `duplicate_service.find_duplicates` compare la fiche aux médecins existants
       (téléphone normalisé, e-mail, nom normalisé et translittérations, adresse) → score + raisons.
    3. Le formulaire est pré-rempli (source = « carte_de_visite ») ; les doublons sont affichés
       AVANT l'enregistrement. Le délégué choisit : compléter la fiche existante ou créer quand même.
       Rien n'est jamais enregistré sans sa relecture.

Données de test
    10 paires de quasi-doublons dans la base (voir /seed_duplicates.md) et 4 cartes d'exemple
    dans frontend/public/demo-cards/ (générées par backend/scripts/generer_cartes_demo.py).
    Évaluation : backend/scripts/evaluer_doublons.py.
"""
import re

from sqlalchemy.orm import Session

from app.ai import llm
from app.ai.schemas import CardFields, CardScanRequest, CardScanResult, DuplicateMatch
from app.models import User
from app.models.enums import SPECIALTIES
from app.seed_data.geography import REGIONS
from app.services import duplicate_service
from app.services.duplicate_service import simplify

# --- Référentiels utilisés par les règles ----------------------------------------------------

# Spécialité du référentiel → mots qui la signalent sur une carte (comparés sans accents)
SPECIALTY_PATTERNS: list[tuple[str, str]] = [
    ("Cardiologue", r"cardio|maladies du coeur|vaisseaux"),
    ("Endocrinologue", r"endocrino|diabeto|nutrition|thyroide"),
    ("Pédiatre", r"pediatr|enfants?\b|nourrisson|neonat"),
    ("Gynécologue", r"gyneco|obstetri|maternite|accouchement"),
    ("Pneumologue", r"pneumo|allergo|phtisio|respiratoire|poumons?"),
    ("Gastro-entérologue", r"gastro|hepato|endoscopie digestive|proctolog"),
    ("Dermatologue", r"dermato|venereo|maladies de la peau|esthetique"),
    ("Rhumatologue", r"rhumato|osteo|articulaire"),
    ("ORL", r"\borl\b|oto.?rhino|chirurgie cervico"),
    ("Généraliste", r"generaliste|medecine generale|medecin de famille"),
]

# Villes connues (et quelques abréviations courantes sur les cartes)
CITY_ALIASES = {"casa": "Casablanca", "fes": "Fès", "fez": "Fès", "meknes": "Meknès", "sale": "Salé",
                "temara": "Témara"}
DISTRICTS_BY_CITY: dict[str, list[str]] = {}
for _places in REGIONS.values():
    for _city, _district, *_ in _places:
        DISTRICTS_BY_CITY.setdefault(_city, []).append(_district)
# Indicatif du fixe → ville la plus probable (seulement pour deviner, champ marqué « incertain »)
CITY_BY_PREFIX = {"0522": "Casablanca", "0523": "Mohammedia", "0537": "Rabat", "0524": "Marrakech",
                  "0535": "Fès"}

# Mots qui font partie du nom de famille quand ils le précèdent (El Amrani, Ben Jelloun, Ait Lahcen)
NAME_PARTICLES = {"el", "al", "ben", "bel", "ibn", "ait", "ould", "abou", "bou"}
TITLE_RE = re.compile(r"^\s*(?:dr|docteur|doctoresse|pr|professeur)\b\.?\s*(.+)$", re.IGNORECASE)
EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
# Numéros marocains : 05 22 25 14 78, 0522-251478, +212 (0)5 22..., 00212 6...
PHONE_RE = re.compile(r"(?:(?:\+|00)\s*212[\s.\-]*(?:\(0\))?|\b0)[\s.\-]*[5-7](?:[\s.\-]*\d){8}\b")
ADDRESS_RE = re.compile(
    r"\b(rue|av|ave|avenue|bd|boulevard|angle|residence|res|imm|immeuble|lot|lotissement|route|place|"
    r"hay|etage|appt|appartement|centre|clinique|chu|hopital|n)\b"
)
# Établissement : ligne qui commence par Cabinet, Clinique, Centre, Polyclinique, Hôpital, CHU...
ESTABLISHMENT_RE = re.compile(r"^(cabinet|clinique|polyclinique|centre|hopital|chu|espace medical|maison medicale)\b")
STREET_WORDS = re.compile(r"\b(rue|av|avenue|bd|boulevard|route|place|angle|residence|imm|immeuble|lot)\b")


# --- Règles : texte de la carte → champs ------------------------------------------------------

def format_phone(raw: str) -> str:
    """« +212 522-251478 » → « 05 22 25 14 78 » (format de la base)."""
    digits = "0" + re.sub(r"\D", "", raw)[-9:]
    return " ".join(digits[i:i + 2] for i in range(0, 10, 2))


def _title_case(word: str) -> str:
    """« WAZZANI » → « Wazzani », « FATIMA-ZAHRA » → « Fatima-Zahra », « el » → « El »."""
    return "-".join(part[:1].upper() + part[1:].lower() for part in word.split("-"))


def split_name(text: str) -> tuple[str, str]:
    """
    « Youssef WAZZANI » → (« Youssef », « Wazzani ») ; « Mohamed El Amrani » → (« Mohamed », « El Amrani »).
    Règle 1 : si certains mots sont en MAJUSCULES (et pas tous), ce sont le nom de famille.
    Règle 2 : sinon le dernier mot, avec les particules qui le précèdent (El, Ben, Ait...).
    """
    words = [w for w in re.split(r"\s+", text.strip(" .,;")) if w]
    if not words:
        return "", ""
    if len(words) == 1:
        return "", _title_case(words[0])
    upper = [w.isupper() and len(w) > 1 for w in words]
    if any(upper) and not all(upper):
        first = [w for w, u in zip(words, upper, strict=True) if not u]
        last = [w for w, u in zip(words, upper, strict=True) if u]
    else:
        start = len(words) - 1
        while start > 1 and simplify(words[start - 1]) in NAME_PARTICLES:
            start -= 1
        first, last = words[:start], words[start:]
    return " ".join(_title_case(w) for w in first), " ".join(_title_case(w) for w in last)


def match_specialty(text: str) -> str | None:
    s = simplify(text)
    for specialty, pattern in SPECIALTY_PATTERNS:
        if re.search(pattern, s):
            return specialty
    return None


def match_city(text: str) -> str | None:
    """Première ville connue citée dans le texte (les plus longues d'abord : « Mohammedia » avant « Casa »)."""
    s = f" {simplify(text)} "
    names = {simplify(c): c for c in DISTRICTS_BY_CITY} | CITY_ALIASES
    for key in sorted(names, key=len, reverse=True):
        if f" {key} " in s:
            return names[key]
    return None


def match_district(text: str, city: str | None) -> str | None:
    if not city:
        return None
    s = f" {simplify(text)} "
    for district in sorted(DISTRICTS_BY_CITY.get(city, []), key=len, reverse=True):
        if district == "Centre-ville":
            continue  # trop vague pour être deviné
        if f" {simplify(district)} " in s:
            return district
    return None


def _clean_address(line: str, city: str | None, district: str | None) -> str:
    """Retire de la ligne d'adresse le code postal, la ville et le quartier (champs à part)."""
    out = re.sub(r"\b\d{5}\b", "", line)
    # Seulement en fin de ligne après une virgule ou un tiret (« 8, Av. de France - Agdal, Rabat »),
    # pour ne pas abîmer « Bd d'Anfa » ou « Résidence Anfa Place »
    for _ in range(3):
        for word in filter(None, [city, district, "Casa"]):
            out = re.sub(rf"(?i)\s*[,\-–]\s*{re.escape(word)}\s*$", "", out.strip())
    out = re.sub(r"(?i)^\s*(adresse|cabinet)\s*:?\s*", "", out)
    return re.sub(r"\s{2,}", " ", out).strip(" ,-–")


def extract_fields(text: str) -> tuple[CardFields, list[str]]:
    """
    Texte brut d'une carte (lu par l'OCR) → champs du médecin + liste des champs incertains.
    Les règles sont volontairement simples et lisibles ; le délégué corrige dans le formulaire.
    """
    lines = [ln.strip() for ln in (text or "").splitlines() if ln.strip()]
    fields = CardFields()
    uncertain: list[str] = []

    # E-mail et téléphones
    email = EMAIL_RE.search(text or "")
    fields.email = email.group(0).lower() if email else None
    phones: list[tuple[int, str]] = []  # (priorité, numéro)
    for line in lines:
        if "fax" in simplify(line):
            continue
        for m in PHONE_RE.finditer(line):
            number = format_phone(m.group(0))
            priority = 0 if re.search(r"(?i)t[ée]l|cabinet|fixe|rdv", line) else 1
            if number.startswith("05"):
                priority -= 0.5  # le fixe du cabinet passe avant le portable
            phones.append((priority, number))
    if phones:
        fields.phone = sorted(phones, key=lambda p: p[0])[0][1]

    # Nom : ligne qui commence par « Dr » / « Pr », sinon première ligne qui ressemble à un nom
    name_line = None
    for line in lines:
        m = TITLE_RE.match(line)
        if m:
            name_line = m.group(1)
            break
    if name_line is None:
        for line in lines:
            words = line.split()
            if (2 <= len(words) <= 4 and re.fullmatch(r"[A-Za-zÀ-ÿ' \-]+", line)
                    and not match_specialty(line) and not ADDRESS_RE.search(simplify(line))):
                name_line = line
                uncertain.append("last_name")
                break
    if name_line:
        fields.first_name, fields.last_name = split_name(name_line)

    # Spécialité, type d'exercice, ville, quartier (cherchés dans tout le texte sauf la ligne du nom)
    body = "\n".join(ln for ln in lines if name_line is None or name_line not in ln)
    fields.specialty = match_specialty(body)
    s = simplify(body)
    if re.search(r"\bchu\b|hopital|centre hospitalier", s):
        fields.practice_type = "hopital_public"
    elif "clinique" in s:
        fields.practice_type = "clinique"
    # sinon : rien d'écrit sur la carte → on ne devine pas (le formulaire propose « cabinet »)

    fields.city = match_city(body)
    if fields.city is None and fields.phone and fields.phone.replace(" ", "")[:4] in CITY_BY_PREFIX:
        fields.city = CITY_BY_PREFIX[fields.phone.replace(" ", "")[:4]]
        uncertain.append("city")
    fields.district = match_district(body, fields.city)
    if fields.city and not fields.district:
        uncertain.append("district")

    # Établissement (nom du cabinet, de la clinique...) : recopié tel quel
    for line in lines:
        if line != name_line and ESTABLISHMENT_RE.match(simplify(line)) and not PHONE_RE.search(line):
            fields.establishment = line.strip(" -,")
            break

    # Adresse : première ligne qui contient un mot de rue (Rue, Av., Bd, Résidence...)
    for line in lines:
        if EMAIL_RE.search(line) or PHONE_RE.search(line) or line == name_line:
            continue
        if STREET_WORDS.search(simplify(line)) or re.match(r"^\s*\d+\s*,", line):
            fields.address = _clean_address(line, fields.city, fields.district)
            break

    for field in ("first_name", "last_name", "specialty", "address"):
        if not getattr(fields, field) and field not in uncertain:
            uncertain.append(field)
    return fields, uncertain


# --- Claude (vision) : photo → champs -----------------------------------------------------------

SYSTEM = (
    "Tu lis des cartes de visite de médecins au Maroc pour un CRM pharmaceutique. "
    "Recopie exactement ce qui est écrit, sans rien inventer : un champ absent de la carte reste vide. "
    "Les cartes peuvent être en français et en arabe ; écris les noms en lettres latines, "
    "tels qu'ils apparaissent sur la carte."
)
CARD_SCHEMA = llm.strict_object({
    "raw_text": {"type": "string", "description": "Tout le texte lisible de la carte, ligne par ligne"},
    "first_name": {"type": "string"},
    "last_name": {"type": "string"},
    "specialty": {"type": "string", "description": "Une valeur de la liste fournie, ou chaîne vide"},
    "practice_type": {"type": "string", "enum": ["cabinet", "clinique", "hopital_public"]},
    "establishment": {"type": "string", "description": "Nom du cabinet, de la clinique ou de l'hôpital s'il est écrit, sinon chaîne vide"},
    "address": {"type": "string", "description": "Numéro et rue seulement (sans ville ni quartier)"},
    "city": {"type": "string"},
    "district": {"type": "string", "description": "Quartier, ou chaîne vide"},
    "phone": {"type": "string", "description": "Téléphone du cabinet de préférence (pas le fax)"},
    "email": {"type": "string"},
})


def read_card_with_claude(image_base64: str, media_type: str = "image/jpeg") -> tuple[str, CardFields] | None:
    """Photo → (texte de la carte, champs) avec Claude ; None si Claude n'est pas disponible."""
    prompt = [
        llm.image_block(image_base64, media_type),
        {"type": "text", "text": (
            "Lis cette carte de visite de médecin et remplis les champs.\n"
            f"Spécialités possibles : {', '.join(SPECIALTIES)}.\n"
            f"Villes connues : {', '.join(DISTRICTS_BY_CITY)}."
        )},
    ]
    data = llm.ask_json(SYSTEM, prompt, CARD_SCHEMA, max_tokens=2000)
    if not data:
        return None
    raw_text = data.pop("raw_text", "")
    fields = CardFields(**{k: (v.strip() if isinstance(v, str) else v) or None for k, v in data.items()})
    fields.first_name = fields.first_name or ""
    fields.last_name = fields.last_name or ""
    fields.address = fields.address or ""
    # On ramène spécialité, ville et quartier aux valeurs du référentiel quand c'est possible
    fields.specialty = match_specialty(fields.specialty or "") or (fields.specialty if fields.specialty in SPECIALTIES else None)
    fields.city = match_city(fields.city or "") or fields.city
    fields.district = match_district(fields.district or "", fields.city) or fields.district
    if fields.phone:
        fields.phone = format_phone(fields.phone) if len(re.sub(r"\D", "", fields.phone)) >= 9 else fields.phone
    return raw_text, fields


# --- Point d'entrée -------------------------------------------------------------------------

def find_duplicates(db: Session, user: User, doctor: CardFields, exclude_id: int | None = None) -> list[DuplicateMatch]:
    """Médecins existants qui ressemblent à `doctor` (voir app/services/duplicate_service.py)."""
    matches = duplicate_service.find_duplicates(db, user, doctor.model_dump(), exclude_id=exclude_id)
    return [DuplicateMatch(**m) for m in matches]


def scan_card(db: Session, user: User, request: CardScanRequest) -> CardScanResult:
    """
    Appelé par l'API. Ordre : Claude vision (si clé) → sinon règles sur le texte de l'OCR du navigateur
    → sinon on répond `needs_ocr=True` : le navigateur fait l'OCR et renvoie le texte.
    """
    if request.image_base64 and llm.is_available():
        result = read_card_with_claude(request.image_base64, request.media_type)
        if result is not None:
            raw_text, fields = result
            uncertain = [f for f in ("first_name", "last_name", "specialty", "address", "city") if not getattr(fields, f)]
            return CardScanResult(raw_text=raw_text, doctor=fields, duplicates=find_duplicates(db, user, fields),
                                  method="claude", uncertain_fields=uncertain)

    if request.raw_text and request.raw_text.strip():
        fields, uncertain = extract_fields(request.raw_text)
        return CardScanResult(raw_text=request.raw_text, doctor=fields, duplicates=find_duplicates(db, user, fields),
                              method="regles", uncertain_fields=uncertain)

    return CardScanResult(raw_text="", doctor=CardFields(), duplicates=[], method="aucune", needs_ocr=True)
