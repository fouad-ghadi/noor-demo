"""
Détection des doublons de médecins (même médecin saisi deux fois, écrit autrement).

Utilisée par le scan de carte de visite (app/ai/card_scanner.py) et par le formulaire
« Nouveau médecin » : avant de créer une fiche, NOOR montre les fiches qui lui ressemblent.

Principe (sans IA générative, entièrement explicable au jury) :
    1. On NORMALISE ce qui peut s'écrire de plusieurs façons :
       - téléphone : on garde les 9 derniers chiffres (+212 522-251478 = 05 22 25 14 78) ;
       - nom : minuscules, sans accents, sans espaces ni tirets, article « El » / « Et » retiré
         (El Amrani = Elamrani = Amrani ; Ettahiri = Tahiri) ;
       - translittérations arabe → français : « ou » = « w », « q » = « k », lettres doublées
         simplifiées (Ouazzani = Wazzani, Sqalli = Skalli, Mohammed = Mohamed).
    2. On COMPARE avec chaque fiche existante et on additionne des indices :
       même téléphone, même e-mail, nom proche, même adresse.
    3. On renvoie un SCORE (0 → 1) et les RAISONS lisibles. Le délégué décide toujours :
       compléter la fiche existante ou créer quand même.
"""
import re
import unicodedata
from difflib import SequenceMatcher

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import Doctor, User
from app.services import access

# Score minimal pour signaler une fiche (en dessous : ressemblance due au hasard)
MIN_SCORE = 0.5

# Poids de chaque indice. Ils se combinent comme des probabilités indépendantes :
# score = 1 − (1 − p1) × (1 − p2) × ...  (deux indices moyens donnent un score fort).
P_PHONE = 0.75     # même numéro : très probablement le même cabinet / médecin
P_EMAIL = 0.80     # même e-mail : presque certain
P_NAME = 0.60      # même nom (prénom + nom), à pondérer par la ressemblance
P_NAME_CITY = 0.10  # bonus si en plus même ville
P_NAME_WEAK = 0.35  # nom seulement proche : ne suffit pas seul
P_ADDRESS = 0.35   # même adresse dans la même ville


# ---------------------------------------------------------------------------
# Normalisation
# ---------------------------------------------------------------------------

def strip_accents(text: str) -> str:
    """« Chraïbi » → « Chraibi »."""
    return "".join(c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c))


def simplify(text: str | None) -> str:
    """Minuscules, sans accents, tout ce qui n'est pas lettre ou chiffre devient un espace."""
    text = strip_accents(text or "").lower()
    return " ".join(re.sub(r"[^a-z0-9]+", " ", text).split())


def phone_key(phone: str | None) -> str | None:
    """Les 9 derniers chiffres du numéro (indépendant de +212, 0, espaces, points, tirets)."""
    digits = re.sub(r"\D", "", phone or "")
    return digits[-9:] if len(digits) >= 9 else None


def email_key(email: str | None) -> str | None:
    email = (email or "").strip().lower()
    return email or None


def phonetic(word: str) -> str:
    """
    Clé « phonétique » d'un mot déjà simplifié : rapproche les translittérations courantes
    de l'arabe vers le français (Ouazzani / Wazzani, Sqalli / Skalli, Youssef / Yousef).
    """
    w = word.replace(" ", "")
    for old, new in (("ou", "w"), ("q", "k"), ("ph", "f"), ("ck", "k"), ("y", "i"), ("dh", "d")):
        w = w.replace(old, new)
    return re.sub(r"(.)\1+", r"\1", w)  # lettres doublées : « mm » → « m »


def last_name_key(last_name: str | None) -> str:
    """
    Nom de famille comparable : collé, sans article « El » / « Al », article assimilé retiré
    (« Ettahiri » = « Et-Tahiri » = « Tahiri »), puis clé phonétique.
    """
    s = simplify(last_name).replace(" ", "")
    if len(s) > 5 and s[:2] in ("el", "al"):
        s = s[2:]
    # Article assimilé : e + consonne « solaire » doublée (Ettahiri, Ennaji, Essaidi...)
    s = re.sub(r"^e([tdsnrzl])(?=\1.{3,})", "", s)
    return phonetic(s)


def first_name_key(first_name: str | None) -> str:
    return phonetic(simplify(first_name))


def similarity(a: str, b: str) -> float:
    """Ressemblance entre deux clés (1 = identiques)."""
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    return SequenceMatcher(None, a, b).ratio()


def address_tokens(address: str | None) -> set[str]:
    """Mots significatifs d'une adresse (« 14, Rue Ibnou Mounir » = « Rue Ibnou Mounir n°14 »)."""
    ignore = {"n", "no", "rue", "av", "avenue", "bd", "boulevard", "de", "du", "la", "le", "des", "d", "l"}
    return {t for t in simplify(address).split() if t not in ignore}


# ---------------------------------------------------------------------------
# Comparaison
# ---------------------------------------------------------------------------

def compare(candidate: dict, doctor: Doctor) -> tuple[float, list[str]]:
    """
    Compare une fiche « candidate » (champs extraits d'une carte, ou saisis) à un médecin existant.
    `candidate` : dict avec first_name, last_name, phone, email, address, city (tous facultatifs).
    Renvoie (score 0 → 1, raisons lisibles).
    """
    reasons: list[str] = []
    probas: list[float] = []

    # 1. Téléphone
    cand_phone = phone_key(candidate.get("phone"))
    if cand_phone and cand_phone == phone_key(doctor.phone):
        probas.append(P_PHONE)
        reasons.append(f"même téléphone ({doctor.phone})")

    # 2. E-mail
    cand_email = email_key(candidate.get("email"))
    if cand_email and cand_email == email_key(doctor.email):
        probas.append(P_EMAIL)
        reasons.append(f"même e-mail ({doctor.email})")

    # 3. Nom et prénom
    last_sim = similarity(last_name_key(candidate.get("last_name")), last_name_key(doctor.last_name))
    if last_sim >= 0.8:
        cand_first = first_name_key(candidate.get("first_name"))
        # Prénom absent de la carte : on ne peut ni confirmer ni infirmer
        first_sim = similarity(cand_first, first_name_key(doctor.first_name)) if cand_first else 0.7
        identity = last_sim * first_sim
        if identity >= 0.95:
            # Même nom aux variantes d'écriture près : indice fort à lui seul
            same_city = simplify(candidate.get("city")) == simplify(doctor.city) and bool(candidate.get("city"))
            probas.append(P_NAME * identity + (P_NAME_CITY if same_city else 0))
            reasons.append(_name_reason(candidate, doctor, last_sim, first_sim))
        elif identity >= 0.6:
            # Nom seulement proche (Noureddine / Nourdine, mais aussi Amal / Kamal...) : indice
            # faible, qui ne suffit pas seul mais renforce un téléphone ou une adresse identiques
            probas.append(P_NAME_WEAK * identity)
            reasons.append(_name_reason(candidate, doctor, last_sim, first_sim))

    # 4. Adresse (seulement dans la même ville)
    cand_tokens = address_tokens(candidate.get("address"))
    doc_tokens = address_tokens(doctor.address)
    if cand_tokens and doc_tokens and simplify(candidate.get("city")) in ("", simplify(doctor.city)):
        overlap = len(cand_tokens & doc_tokens) / len(cand_tokens | doc_tokens)
        if overlap >= 0.75:
            probas.append(P_ADDRESS)
            reasons.append("même adresse")

    remaining = 1.0
    for p in probas:
        remaining *= 1 - p
    return round(1 - remaining, 2), reasons


def _name_reason(candidate: dict, doctor: Doctor, last_sim: float, first_sim: float) -> str:
    """Explique la ressemblance des noms, ex. « nom proche : Wazzani / Ouazzani »."""
    cand_full = f"{candidate.get('first_name') or ''} {candidate.get('last_name') or ''}".strip()
    doc_full = f"{doctor.first_name} {doctor.last_name}"
    if simplify(cand_full) == simplify(doc_full):
        return "même nom"
    if last_sim == 1.0 and first_sim == 1.0:
        return f"même nom écrit autrement : {cand_full} / {doc_full}"
    return f"nom proche : {cand_full} / {doc_full}"


def level_of(score: float) -> str:
    """Niveau lisible du score (utilisé par l'interface)."""
    if score >= 0.85:
        return "tres_probable"
    if score >= 0.65:
        return "probable"
    return "possible"


# ---------------------------------------------------------------------------
# Recherche dans la base
# ---------------------------------------------------------------------------

def find_duplicates(
    db: Session,
    user: User,
    candidate: dict,
    *,
    exclude_id: int | None = None,
    limit: int = 5,
) -> list[dict]:
    """
    Cherche les médecins existants qui ressemblent à `candidate`, du plus au moins probable.

    On cherche dans TOUTE la base, pas seulement dans le portefeuille de l'utilisateur :
    un même médecin suivi par deux délégués est justement le doublon le plus coûteux.
    Une fiche hors du périmètre de l'utilisateur est signalée (`in_scope=False`) avec le nom
    du délégué qui la suit, sans lien vers la fiche (il n'y a pas accès).
    """
    if not any(candidate.get(k) for k in ("last_name", "phone", "email")):
        return []

    visible = set(access.visible_delegue_ids(db, user))
    doctors = db.scalars(select(Doctor).options(selectinload(Doctor.delegue)))
    matches = []
    for doctor in doctors:
        if doctor.id == exclude_id:
            continue
        score, reasons = compare(candidate, doctor)
        if score < MIN_SCORE:
            continue
        matches.append({
            "doctor_id": doctor.id,
            "doctor_name": doctor.full_name,
            "specialty": doctor.specialty,
            "city": doctor.city,
            "district": doctor.district,
            "phone": doctor.phone,
            "delegue_name": doctor.delegue.name,
            "in_scope": doctor.delegue_id in visible,
            "score": score,
            "level": level_of(score),
            "reasons": reasons,
        })
    matches.sort(key=lambda m: -m["score"])
    return matches[:limit]


def find_all_pairs(db: Session) -> list[tuple[Doctor, Doctor, float, list[str]]]:
    """
    Toutes les paires de doublons probables de la base (pour l'évaluation et le superviseur).
    Pour aller vite, on ne compare que les médecins d'une même ville.
    """
    by_city: dict[str, list[Doctor]] = {}
    for d in db.scalars(select(Doctor).order_by(Doctor.id)):
        by_city.setdefault(d.city, []).append(d)
    pairs = []
    for doctors in by_city.values():
        for i, a in enumerate(doctors):
            cand = {"first_name": a.first_name, "last_name": a.last_name, "phone": a.phone,
                    "email": a.email, "address": a.address, "city": a.city}
            for b in doctors[i + 1:]:
                score, reasons = compare(cand, b)
                if score >= MIN_SCORE:
                    pairs.append((a, b, score, reasons))
    pairs.sort(key=lambda p: -p[2])
    return pairs


# ---------------------------------------------------------------------------
# « Compléter la fiche existante » avec une carte de visite
# ---------------------------------------------------------------------------

FIELD_LABELS = {
    "first_name": "Prénom", "last_name": "Nom", "specialty": "Spécialité", "practice_type": "Type d'exercice",
    "address": "Adresse", "city": "Ville", "district": "Quartier", "phone": "Téléphone", "email": "E-mail",
}


def merge_proposal(db: Session, user: User, doctor_id: int, card: dict) -> dict:
    """
    Propose la fiche existante complétée par la carte, SANS rien enregistrer :
    le délégué relit dans le formulaire de modification puis enregistre lui-même.

    Règles :
    - nom et prénom : on garde la graphie de la base (référence) ; celle de la carte va dans les notes ;
    - champ vide dans la base : complété par la carte (« ajout ») ;
    - téléphone, e-mail, adresse, spécialité différents : la carte est plus récente, on la prend
      (« remplacement ») et l'ancien téléphone est gardé dans les notes ;
    - même valeur écrite autrement (05.22... / +212 522...) : rien ne change.
    """
    from app.schemas.doctor import DoctorBase  # import local : évite un import circulaire
    from app.seed_data.geography import REGIONS

    doctor = access.get_doctor_or_403(db, user, doctor_id)
    fields = DoctorBase.model_validate(doctor, from_attributes=True).model_dump()
    changes: list[dict] = []
    notes: list[str] = []

    def change(field: str, old, new, action: str) -> None:
        changes.append({"field": field, "label": FIELD_LABELS[field], "old": old, "new": new, "action": action})

    # Nom et prénom : on ne touche pas à la graphie de référence
    for field in ("first_name", "last_name"):
        new = (card.get(field) or "").strip()
        if new and simplify(new) != simplify(fields[field]):
            change(field, fields[field], new, "conserve")
    card_name = f"{card.get('first_name') or ''} {card.get('last_name') or ''}".strip()
    if any(c["action"] == "conserve" for c in changes):
        notes.append(f"Nom écrit « {card_name} » sur la carte de visite.")

    def same(field: str, old, new) -> bool:
        if field == "phone":
            return phone_key(old) == phone_key(new)
        if field == "address":
            a, b = address_tokens(old), address_tokens(new)
            return bool(a | b) and len(a & b) / len(a | b) >= 0.75
        return simplify(old) == simplify(new)

    for field in ("specialty", "practice_type", "address", "city", "district", "phone", "email"):
        new = card.get(field)
        new = new.strip() if isinstance(new, str) else new
        if not new:
            continue
        old = fields[field]
        if not old:
            fields[field] = new
            change(field, old, new, "ajout")
        elif not same(field, old, new):
            fields[field] = new
            change(field, old, new, "remplacement")
            if field == "phone":
                notes.append(f"Ancien téléphone : {old}.")

    # Quartier changé : position GPS = centre du nouveau quartier (pour la carte du planning)
    if any(c["field"] in ("city", "district") for c in changes):
        for places in REGIONS.values():
            for city, district, lat, lon, _ in places:
                if city == fields["city"] and district == fields["district"]:
                    fields["latitude"], fields["longitude"] = lat, lon

    if changes:
        notes.append("Fiche complétée depuis une carte de visite.")
        fields["notes"] = "\n".join(filter(None, [fields.get("notes"), " ".join(notes)]))
    return {"doctor_id": doctor.id, "fields": fields, "changes": changes}
