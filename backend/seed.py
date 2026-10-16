"""
Génère la base de démo NOOR (backend/noor.db).

    python seed.py

⚠️ Le script SUPPRIME la base existante puis la recrée : il est rejouable à volonté.
Le hasard est « figé » (graine fixe) : on obtient les mêmes données à chaque exécution
le même jour. L'historique est calculé par rapport à la date du jour :
6 mois de visites (le mois courant + les 5 précédents) et 2 semaines de visites planifiées.
→ Relancez le seed le matin d'une démo pour avoir un agenda du jour à jour.

Contenu :
- 1 superviseur + 4 délégués (Casablanca, Rabat-Salé, Marrakech, Fès-Meknès)
- 200 médecins dont 10 quasi-doublons volontaires (voir seed_duplicates.md)
- 10 produits fictifs + leurs documents (RCP, notice, support promotionnel)
- ~6 mois d'historique de visites avec comptes-rendus, objections, échantillons
- objectifs mensuels (certains délégués en avance, d'autres en retard)
- alertes calculées par les règles métier
"""
import random
import unicodedata
from collections import Counter, defaultdict
from datetime import date, datetime, time, timedelta
from pathlib import Path

from app.database import Base, SessionLocal, engine
from app.models import (
    Alert,
    Doctor,
    DoctorProductStatus,
    Document,
    Objective,
    ObjectiveProduct,
    Product,
    User,
    Visit,
    VisitObjection,
    VisitProduct,
    VisitSample,
)
from app.models.enums import (
    AlertStatus,
    DocumentType,
    PrescribingStatus,
    ReportSource,
    Role,
    VisitFeedback,
    VisitStatus,
)
from app.seed_data.geography import FACILITIES, REGIONS, STREETS
from app.seed_data.names import FEMALE_FIRST_NAMES, LAST_NAMES, MALE_FIRST_NAMES
from app.seed_data.products import PRODUCTS
from app.seed_data.texts import (
    CANCEL_REASONS,
    NEXT_STEPS,
    NOTES_NEUTRAL,
    NOTES_POSITIVE,
    NOTES_RESERVED,
    OBJECTION_COMMENTS,
    PHARMACOVIGILANCE_NOTES,
)
from app.services import alert_service
from app.services.dates import (
    elapsed_fraction,
    is_working_day,
    month_bounds,
    now,
    period_of,
    previous_periods,
)

RNG = random.Random(2026)  # graine fixe → données reproductibles
REPO_ROOT = Path(__file__).resolve().parent.parent

NOW = now()
TODAY = NOW.date()
CURRENT_PERIOD = period_of(TODAY)
PERIODS = previous_periods(CURRENT_PERIOD, 6)            # ex. 2026-05 → 2026-10
HISTORY_START = month_bounds(PERIODS[0])[0].date()       # 1er jour du 1er mois
PLANNING_DAYS = 14                                       # visites planifiées à venir

# ---------------------------------------------------------------------------
# Utilisateurs et « profils » de performance des délégués
# ---------------------------------------------------------------------------
SUPERVISOR = {
    "name": "Nadia Tazi", "email": "nadia.tazi@noor-demo.ma",
    "region": "Maroc — Direction régionale", "phone": "06 61 10 20 30",
}

# interval_factor : < 1 = visite plus souvent ; neglect_a / neglect_b : part des médecins A / B
# négligés (visités trop rarement → « médecins à revoir ») ;
# cancel_rate : taux d'annulation ; achievement : fourchette d'atteinte de l'objectif ;
# pending : nb de comptes-rendus non saisis ; doctors : taille du portefeuille.
DELEGATES = [
    {"name": "Youssef El Idrissi", "email": "youssef.elidrissi@noor-demo.ma", "region": "Casablanca",
     "phone": "06 62 45 12 87", "interval_factor": 0.8, "neglect_a": 0.0, "neglect_b": 0.12, "cancel_rate": 0.05,
     "achievement": (1.04, 1.16), "pending": 1, "doctors": 52, "vacation": (8, 3)},
    {"name": "Salma Berrada", "email": "salma.berrada@noor-demo.ma", "region": "Rabat-Salé",
     "phone": "06 70 33 21 54", "interval_factor": 1.0, "neglect_a": 0.08, "neglect_b": 0.2, "cancel_rate": 0.07,
     "achievement": (0.93, 1.02), "pending": 2, "doctors": 48, "vacation": (7, 20)},
    {"name": "Hamza Ait Lahcen", "email": "hamza.aitlahcen@noor-demo.ma", "region": "Marrakech",
     "phone": "06 61 98 76 05", "interval_factor": 1.25, "neglect_a": 0.3, "neglect_b": 0.35, "cancel_rate": 0.09,
     "achievement": (0.70, 0.83), "pending": 5, "doctors": 46, "vacation": (8, 10)},
    {"name": "Imane Fassi Fihri", "email": "imane.fassifihri@noor-demo.ma", "region": "Fès-Meknès",
     "phone": "06 64 07 58 19", "interval_factor": 1.1, "neglect_a": 0.15, "neglect_b": 0.3, "cancel_rate": 0.15,
     "achievement": (0.78, 0.90), "pending": 3, "doctors": 44, "vacation": (8, 17)},
]

# Jours fériés marocains (les dates des fêtes religieuses sont approximatives)
HOLIDAYS = {
    (5, 1), (5, 27), (5, 28), (6, 16), (7, 30), (8, 14), (8, 20), (8, 21), (8, 26),
    (11, 6), (11, 18), (1, 1), (1, 11), (1, 14),
}

# Fréquence de visite de base (en jours) par segment
BASE_INTERVAL = {"A": 14, "B": 30, "C": 65}
SLOT_HOURS = {"matin": (9, 0, 11, 30), "midi": (12, 0, 13, 30), "apres_midi": (15, 0, 18, 30)}
SLOT_LABELS = {"matin": "le matin", "midi": "à l'heure du déjeuner", "apres_midi": "l'après-midi"}

# ---------------------------------------------------------------------------
# Quasi-doublons volontaires (pour la future détection de doublons)
# Chaque entrée : région, fiche d'origine, variante, explication.
# ---------------------------------------------------------------------------
DUPLICATES = [
    ("Casablanca",
     dict(first_name="Mohammed", last_name="El Amrani", specialty="Cardiologue", district="Maârif",
          address="45, Bd Zerktouni", phone="05 22 25 14 78", segment="A"),
     dict(first_name="Mohamed", last_name="Elamrani", phone="+212 522-251478", source="carte_de_visite"),
     "Prénom Mohammed/Mohamed, nom collé, même téléphone au format international"),
    ("Casablanca",
     dict(first_name="Karim", last_name="Benjelloun", specialty="Généraliste", district="Gauthier",
          address="12, Rue Jean Jaurès", phone="05 22 47 30 12", segment="B"),
     dict(first_name="Karim", last_name="Ben Jelloun", phone="0522473012", source="import"),
     "Nom Benjelloun/Ben Jelloun, même téléphone sans espaces"),
    ("Casablanca",
     dict(first_name="Fatima Zahra", last_name="Alaoui", specialty="Gynécologue", district="Racine",
          address="14, Rue Ibnou Mounir", phone="06 61 23 45 67", segment="A"),
     dict(first_name="Fatima-Zahra", last_name="Alaoui", address="Rue Ibnou Mounir n°14",
          phone="0661234567", source="carte_de_visite"),
     "Prénom composé avec tiret, adresse écrite autrement, même mobile"),
    ("Rabat-Salé",
     dict(first_name="Youssef", last_name="Ouazzani", specialty="Pneumologue", district="Agdal",
          address="8, Av. de France", phone="05 37 77 18 42", segment="A"),
     dict(first_name="Youssef", last_name="Wazzani", source="carte_de_visite"),
     "Translittération Ouazzani/Wazzani, même adresse et téléphone"),
    ("Rabat-Salé",
     dict(first_name="Khadija", last_name="Benkirane", specialty="Pédiatre", district="Hay Riad",
          address="3, Av. Annakhil", phone="05 37 56 90 11", segment="B",
          email="dr.benkirane.khadija@gmail.com"),
     dict(first_name="Khadija", last_name="Ben Kirane", phone="05 37 56 90 11", source="import"),
     "Nom Benkirane/Ben Kirane, même email et même téléphone"),
    ("Rabat-Salé",
     dict(first_name="Abdelaziz", last_name="Chraibi", specialty="Endocrinologue", district="Souissi",
          address="21, Av. Mohammed VI", phone="05 37 65 43 29", segment="A"),
     dict(first_name="Abdelaziz", last_name="Chraïbi", phone="05.37.65.43.29", source="manuel"),
     "Tréma Chraibi/Chraïbi (fiche recréée à la main), téléphone avec points"),
    ("Marrakech",
     dict(first_name="Hicham", last_name="El Idrissi", specialty="Généraliste", district="Guéliz",
          address="67, Av. Mohammed V", phone="05 24 43 18 90", segment="B"),
     dict(first_name="Hicham", last_name="Idrissi", phone="0524-43-18-90", source="carte_de_visite"),
     "Article « El » omis, téléphone avec tirets"),
    ("Marrakech",
     dict(first_name="Said", last_name="Tahiri", specialty="Rhumatologue", district="Daoudiate",
          address="5, Rue Ibn Aïcha", phone="06 68 12 77 30", segment="A"),
     dict(first_name="Saïd", last_name="Ettahiri", phone="+212 668 127 730", source="import"),
     "Said/Saïd et Tahiri/Ettahiri (article assimilé), même mobile"),
    ("Fès-Meknès",
     dict(first_name="Noureddine", last_name="Sqalli", specialty="Cardiologue", district="Ville Nouvelle",
          address="18, Av. Hassan II", phone="05 35 62 14 08", segment="A"),
     dict(first_name="Nourdine", last_name="Skalli", source="carte_de_visite"),
     "Noureddine/Nourdine et Sqalli/Skalli, même adresse et téléphone"),
    ("Fès-Meknès",
     dict(first_name="Meryem", last_name="Lahlou", specialty="Dermatologue", district="Atlas",
          address="9, Av. des FAR", phone="06 71 55 03 26", segment="B"),
     dict(first_name="Maryam", last_name="Lahlou", phone="0671550326", source="carte_de_visite"),
     "Meryem/Maryam, même mobile sans espaces"),
]

DOCTOR_NOTES = [
    "Ne reçoit que sur rendez-vous.",
    "Préfère des visites courtes, aller droit au but.",
    "Exerce aussi en clinique le mardi après-midi.",
    "Très intéressé par les études cliniques et les congrès.",
    "Chef de service, influent auprès des jeunes confrères.",
    "Secrétaire : Mme Naima, très arrangeante.",
    "Membre actif de la société marocaine de sa spécialité.",
]

# Poids des spécialités et des catégories d'objection (plus le poids est grand, plus c'est fréquent)
SPECIALTY_WEIGHTS = {
    "Généraliste": 34, "Cardiologue": 11, "Endocrinologue": 8, "Pédiatre": 10, "Gynécologue": 8,
    "Pneumologue": 7, "Gastro-entérologue": 6, "Dermatologue": 5, "Rhumatologue": 5, "ORL": 6,
}
OBJECTION_WEIGHTS = {
    "prix_eleve": 20, "prefere_generique": 18, "concurrent_satisfaisant": 14, "etudes_locales": 10,
    "effets_indesirables": 7, "remboursement": 8, "disponibilite": 6, "habitudes": 11, "posologie": 6,
}


# ---------------------------------------------------------------------------
# Petites fonctions utilitaires
# ---------------------------------------------------------------------------

def weighted(choices: dict):
    return RNG.choices(list(choices), weights=list(choices.values()))[0]


def ascii_lower(text: str) -> str:
    """« Chraïbi El Fassi » -> « chraibielfassi » (pour les emails)."""
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return "".join(c for c in text.lower() if c.isalnum())


def fixed_phone(prefix: str) -> str:
    digits = prefix + "".join(str(RNG.randint(0, 9)) for _ in range(6))
    return " ".join(digits[i:i + 2] for i in range(0, 10, 2))


def mobile_phone() -> str:
    digits = RNG.choice(["06", "07"]) + "".join(str(RNG.randint(0, 9)) for _ in range(8))
    return " ".join(digits[i:i + 2] for i in range(0, 10, 2))


def is_off_day(d: date, vacation: tuple[int, int]) -> bool:
    """Week-end, jour férié ou congés du délégué (2 semaines l'été)."""
    if not is_working_day(d) or (d.month, d.day) in HOLIDAYS:
        return True
    vac_start = date(d.year, vacation[0], vacation[1])
    return vac_start <= d < vac_start + timedelta(days=14)


def slot_of(t: time) -> str:
    return "matin" if t.hour < 12 else ("midi" if t.hour < 14 else "apres_midi")


def random_time_in(slot: str) -> time:
    h1, m1, h2, m2 = SLOT_HOURS[slot]
    start, end = h1 * 60 + m1, h2 * 60 + m2
    minutes = RNG.randrange(start, end + 1, 15)
    return time(minutes // 60, minutes % 60)


# ---------------------------------------------------------------------------
# Création des données
# ---------------------------------------------------------------------------

def create_users(db) -> tuple[User, list[tuple[User, dict]]]:
    supervisor = User(role=Role.SUPERVISEUR, password="demo", **SUPERVISOR)
    db.add(supervisor)
    db.flush()
    delegates = []
    for profile in DELEGATES:
        fields = {k: profile[k] for k in ("name", "email", "region", "phone")}
        user = User(role=Role.DELEGUE, password="demo", supervisor_id=supervisor.id, **fields)
        db.add(user)
        delegates.append((user, profile))
    db.flush()
    return supervisor, delegates


def create_products(db) -> list[Product]:
    products = []
    for data in PRODUCTS:
        product = Product(**data)
        name = data["brand_name"]
        product.documents = [
            Document(title=f"RCP — {name} ({data['molecule']})", doc_type=DocumentType.RCP, version="2025-03"),
            Document(title=f"Notice patient — {name}", doc_type=DocumentType.NOTICE, version="2025-03"),
            Document(title=f"Aide de visite {name} — {data['key_messages'][0]}",
                     doc_type=DocumentType.SUPPORT_PROMOTIONNEL, version="2026-01"),
        ]
        db.add(product)
        products.append(product)
    db.flush()
    return products


def _place_for(region: str, district: str | None = None):
    places = REGIONS[region]
    if district:
        return next(p for p in places if p[1] == district)
    # La ville principale (premières entrées) est plus représentée
    weights = [3 if p[0] == places[0][0] else 1 for p in places]
    return RNG.choices(places, weights=weights)[0]


def _build_doctor(delegue: User, used_names: set, products: list[Product], **override) -> Doctor:
    """Construit un médecin aléatoire réaliste (les champs de `override` sont imposés)."""
    city, district, lat, lon, prefix = _place_for(delegue.region, override.pop("district", None))
    specialty = override.pop("specialty", None) or weighted(SPECIALTY_WEIGHTS)

    first, last = override.pop("first_name", None), override.pop("last_name", None)
    while first is None or (first, last) in used_names:
        first = RNG.choice(FEMALE_FIRST_NAMES if RNG.random() < 0.42 else MALE_FIRST_NAMES)
        last = RNG.choice(LAST_NAMES)
    used_names.add((first, last))

    practice = override.pop("practice_type", None) or RNG.choices(
        ["cabinet", "clinique", "hopital_public"], weights=[70, 18, 12])[0]
    if "address" in override:
        address = override.pop("address")
    elif practice == "cabinet":
        address = f"{RNG.randint(1, 180)}, {RNG.choice(STREETS[city])}"
    else:
        address = f"{RNG.choice(FACILITIES[city][practice])}, {RNG.choice(STREETS[city])}"

    # Les spécialistes ont plus souvent un fort potentiel (segment A)
    seg_weights = [30, 40, 30] if specialty != "Généraliste" else [14, 33, 53]
    segment = override.pop("segment", None) or RNG.choices(["A", "B", "C"], weights=seg_weights)[0]

    slot = "matin" if practice == "hopital_public" and RNG.random() < 0.7 else RNG.choices(
        ["matin", "midi", "apres_midi"], weights=[45, 15, 40])[0]

    doctor = Doctor(
        first_name=first,
        last_name=last,
        specialty=specialty,
        practice_type=practice,
        address=address,
        city=city,
        district=district,
        phone=override.pop("phone", None) or (fixed_phone(prefix) if RNG.random() < 0.7 else mobile_phone()),
        email=override.pop("email", None) or (
            f"dr.{ascii_lower(last)}.{ascii_lower(first)}@gmail.com" if RNG.random() < 0.4 else None),
        latitude=round(lat + RNG.uniform(-0.006, 0.006), 6),
        longitude=round(lon + RNG.uniform(-0.006, 0.006), 6),
        segment=segment,
        preferred_slot=slot,
        notes=RNG.choice(DOCTOR_NOTES) if RNG.random() < 0.25 else None,
        source=override.pop("source", None) or RNG.choices(["import", "manuel"], weights=[70, 30])[0],
        created_at=override.pop("created_at", None)
        or datetime(2025, 1, 6) + timedelta(days=RNG.randint(0, 400), hours=RNG.randint(8, 18)),
        delegue_id=delegue.id,
    )
    assert not override, f"Champs non utilisés : {override}"

    # Statut de prescription pour les produits qui ciblent sa spécialité
    weights = {"A": [20, 35, 45], "B": [35, 40, 25], "C": [60, 30, 10]}[segment]
    for product in products:
        if specialty in product.target_specialties:
            status = RNG.choices(list(PrescribingStatus), weights=weights)[0]
            doctor.prescriptions.append(DoctorProductStatus(product_id=product.id, status=status))
        elif RNG.random() < 0.05:
            doctor.prescriptions.append(
                DoctorProductStatus(product_id=product.id, status=PrescribingStatus.OCCASIONNEL))
    return doctor


def create_doctors(db, delegates, products):
    """
    Renvoie {delegue_id: [médecins « normaux »]} et la liste des paires de doublons.
    Les variantes (doublons) sont créées à part : peu ou pas de visites, fiche récente.
    """
    used_names = {(o["first_name"], o["last_name"]) for _, o, _, _ in DUPLICATES}
    used_names |= {(v.get("first_name"), v.get("last_name")) for _, _, v, _ in DUPLICATES}
    # Pas de médecin homonyme d'un utilisateur (ex. « Dr Salma Berrada »)
    used_names |= {tuple(u["name"].split(" ", 1)) for u in [SUPERVISOR, *DELEGATES]}
    by_delegate: dict[int, list[Doctor]] = defaultdict(list)
    pairs = []

    for user, profile in delegates:
        originals = [(o, v, why) for region, o, v, why in DUPLICATES if region == user.region]
        for original, variant, why in originals:
            doc = _build_doctor(user, set(), products, **dict(original))
            by_delegate[user.id].append(doc)
            # La variante reprend la fiche d'origine, avec les différences indiquées
            fields = {
                "first_name": original["first_name"], "last_name": original["last_name"],
                "specialty": original["specialty"], "district": original["district"],
                "address": original["address"], "phone": original["phone"],
                "practice_type": doc.practice_type, "email": original.get("email"),
                "segment": "C",  # potentiel encore inconnu pour une fiche nouvellement créée
                "created_at": NOW - timedelta(days=RNG.randint(5, 50), hours=RNG.randint(1, 8)),
            }
            fields.update(variant)
            dup = _build_doctor(user, set(), products, **fields)
            dup.latitude, dup.longitude = doc.latitude, doc.longitude
            pairs.append((doc, dup, why))

        for _ in range(profile["doctors"] - len(originals)):
            by_delegate[user.id].append(_build_doctor(user, used_names, products))

    for docs in by_delegate.values():
        db.add_all(docs)
    db.add_all(dup for _, dup, _ in pairs)
    db.flush()
    return by_delegate, pairs


def _fill_report(visit: Visit, doctor: Doctor, products_for: list[Product], prescribing: dict) -> None:
    """Remplit un compte-rendu réaliste pour une visite réalisée."""
    planned = visit.planned_at
    visit.actual_at = planned + timedelta(minutes=RNG.randint(-10, 25))
    visit.duration_min = {"A": RNG.randint(12, 25), "B": RNG.randint(8, 18)}.get(doctor.segment, RNG.randint(5, 12))

    presented = RNG.sample(products_for, k=min(len(products_for), RNG.choices([1, 2, 3], [35, 45, 20])[0]))
    visit.products = [VisitProduct(product_id=p.id) for p in presented]

    # Le retour du médecin dépend du créneau (est-ce son créneau préféré ?) et de sa fidélité
    score = RNG.gauss(0.3, 0.9)
    score += 0.8 if slot_of(visit.actual_at.time()) == doctor.preferred_slot else -0.5
    if any(prescribing.get(p.id) == PrescribingStatus.REGULIER for p in presented):
        score += 0.4
    if score > 1.4:
        feedback = VisitFeedback.TRES_FAVORABLE
    elif score > 0.6:
        feedback = VisitFeedback.FAVORABLE
    elif score > -0.2:
        feedback = VisitFeedback.NEUTRE
    elif score > -0.9:
        feedback = VisitFeedback.RESERVE
    else:
        feedback = VisitFeedback.DEFAVORABLE
    visit.feedback = feedback

    # Objections : plus probables quand l'accueil est réservé
    objection_prob = {"tres_favorable": 0.1, "favorable": 0.25, "neutre": 0.55,
                      "reserve": 0.85, "defavorable": 0.9}[feedback]
    if RNG.random() < objection_prob:
        categories = set()
        for _ in range(RNG.choices([1, 2], [70, 30])[0]):
            categories.add(weighted(OBJECTION_WEIGHTS))
        for cat in categories:
            product = RNG.choice(presented)
            visit.objections.append(VisitObjection(
                category=cat,
                comment=RNG.choice(OBJECTION_COMMENTS[cat]).format(p=product.brand_name),
                product_id=product.id,
            ))

    main = presented[0].brand_name
    pool = (NOTES_POSITIVE if feedback in ("tres_favorable", "favorable")
            else NOTES_NEUTRAL if feedback == "neutre" else NOTES_RESERVED)
    visit.notes = RNG.choice(pool).format(p=main, slot=SLOT_LABELS[doctor.preferred_slot or "matin"])

    if RNG.random() < (0.65 if doctor.segment == "A" else 0.45):
        for p in RNG.sample(presented, k=min(len(presented), RNG.randint(1, 2))):
            visit.samples.append(VisitSample(product_id=p.id, quantity=RNG.choice([2, 3, 4, 5, 6])))
    if RNG.random() < 0.7:
        visit.next_step = RNG.choice(NEXT_STEPS).format(p=main)

    visit.status = VisitStatus.REALISEE
    visit.report_source = ReportSource.MANUEL
    visit.reported_at = visit.actual_at + timedelta(hours=RNG.choice([1, 2, 3, 5, 20, 26]))


def _clear_report(visit: Visit) -> None:
    """Remet une visite à l'état « planifiée sans compte-rendu »."""
    visit.status = VisitStatus.PLANIFIEE
    visit.actual_at = visit.duration_min = visit.feedback = visit.notes = None
    visit.next_step = visit.next_visit_date = visit.report_source = visit.reported_at = None
    visit.products, visit.samples, visit.objections = [], [], []


def _schedule_day(chosen: list[Doctor], day: date) -> list[tuple[Doctor, datetime]]:
    """Attribue une heure à chaque médecin de la tournée, sans chevauchement."""
    planned = []
    for doctor in chosen:
        slot = doctor.preferred_slot if RNG.random() < 0.7 else RNG.choice(list(SLOT_HOURS))
        planned.append((doctor, datetime.combine(day, random_time_in(slot))))
    planned.sort(key=lambda x: x[1])
    for i in range(1, len(planned)):  # au moins 30 min entre deux visites
        if planned[i][1] < planned[i - 1][1] + timedelta(minutes=30):
            planned[i] = (planned[i][0], planned[i - 1][1] + timedelta(minutes=30))
    return planned


def create_visits(db, delegates, by_delegate, products, pairs):
    """Génère l'historique (≈6 mois), l'agenda du jour et les 2 semaines à venir."""
    seg_order = {"A": 0, "B": 1, "C": 2}
    duplicates_by_delegate = defaultdict(list)
    for _, dup, _ in pairs:
        duplicates_by_delegate[dup.delegue_id].append(dup)

    for user, profile in delegates:
        doctors = by_delegate[user.id]
        neglect_rate = {"A": profile["neglect_a"], "B": profile["neglect_b"], "C": 0}
        neglected = {d.id for d in doctors if RNG.random() < neglect_rate[d.segment]}

        def interval(d: Doctor) -> float:
            if d.id in neglected:
                base = 45 if d.segment == "A" else 70
            else:
                base = BASE_INTERVAL[d.segment] * profile["interval_factor"]
            return base * RNG.uniform(0.8, 1.2)

        products_for = {
            d.id: [p for p in products if d.specialty in p.target_specialties] or [products[-4]]
            for d in doctors
        }
        prescribing = {d.id: {ps.product_id: ps.status for ps in d.prescriptions} for d in doctors}
        next_due = {d.id: HISTORY_START + timedelta(days=RNG.uniform(0, interval(d))) for d in doctors}

        visits: list[Visit] = []
        day = HISTORY_START
        last_day = TODAY + timedelta(days=PLANNING_DAYS)
        while day <= last_day:
            if is_off_day(day, profile["vacation"]) or (day < TODAY and RNG.random() < 0.05):
                day += timedelta(days=1)  # week-end, férié, congés ou réunion/formation
                continue
            future = day > TODAY
            due = [d for d in doctors if next_due[d.id] <= day and not (future and d.id in neglected)]
            due.sort(key=lambda d: (seg_order[d.segment], next_due[d.id]))
            capacity = RNG.randint(5, 6) if day == TODAY else RNG.randint(3, 6) if future else RNG.randint(4, 7)
            chosen = due[:capacity]
            # Journée trop creuse : le délégué avance des visites prévues prochainement
            # (aujourd'hui, on veut une tournée complète pour la démo)
            minimum, window = (capacity, 30) if day == TODAY else (3, 7)
            if len(chosen) < minimum:
                soon = sorted(
                    (d for d in doctors if d not in chosen and d.id not in neglected
                     and next_due[d.id] <= day + timedelta(days=window)),
                    key=lambda d: next_due[d.id],
                )
                chosen += soon[: minimum - len(chosen)]

            for doctor, planned_at in _schedule_day(chosen, day):
                visit = Visit(delegue_id=user.id, doctor_id=doctor.id, planned_at=planned_at,
                              status=VisitStatus.PLANIFIEE,
                              created_at=planned_at - timedelta(days=RNG.randint(2, 12)))
                visits.append(visit)
                in_past = planned_at < NOW - timedelta(minutes=30)
                if not in_past:
                    next_due[doctor.id] = day + timedelta(days=interval(doctor))
                    continue
                if day < TODAY and RNG.random() < profile["cancel_rate"]:
                    # Annulée (60 %) ou reportée (40 %) : on reviendra quelques jours après
                    visit.status = VisitStatus.ANNULEE if RNG.random() < 0.6 else VisitStatus.REPORTEE
                    visit.cancel_reason = RNG.choice(CANCEL_REASONS)
                    next_due[doctor.id] = day + timedelta(days=RNG.randint(3, 8))
                    continue
                _fill_report(visit, doctor, products_for[doctor.id], prescribing[doctor.id])
                gap = interval(doctor)
                next_due[doctor.id] = day + timedelta(days=gap)
                visit.next_visit_date = day + timedelta(days=round(gap))
            day += timedelta(days=1)

        # Quelques comptes-rendus non saisis (récents) → « comptes-rendus en attente »
        recent = [v for v in visits if v.status == VisitStatus.REALISEE
                  and TODAY - timedelta(days=6) <= v.planned_at.date() < TODAY]
        for visit in RNG.sample(recent, k=min(profile["pending"], len(recent))):
            _clear_report(visit)

        # Les doublons (fiches récentes) : au plus une visite depuis leur création
        for dup in duplicates_by_delegate[user.id]:
            if RNG.random() < 0.5:
                day = dup.created_at.date() + timedelta(days=RNG.randint(1, 4))
                if day < TODAY and is_working_day(day):
                    visit = Visit(delegue_id=user.id, doctor_id=dup.id,
                                  planned_at=datetime.combine(day, random_time_in("matin")),
                                  created_at=dup.created_at)
                    _fill_report(visit, dup, [p for p in products if dup.specialty in p.target_specialties]
                                 or [products[0]], {})
                    visits.append(visit)

        db.add_all(visits)
    db.flush()


def add_pharmacovigilance_notes(db) -> list[tuple[Visit, str]]:
    """Ajoute à quelques comptes-rendus récents une mention d'effet indésirable."""
    added = []
    for brand, note in PHARMACOVIGILANCE_NOTES:
        candidates = (
            db.query(Visit)
            .join(VisitProduct, VisitProduct.visit_id == Visit.id)
            .join(Product, Product.id == VisitProduct.product_id)
            .filter(Product.brand_name == brand, Visit.status == VisitStatus.REALISEE,
                    Visit.actual_at >= NOW - timedelta(days=75))
            .all()
        )
        candidates = [v for v in candidates if v not in [a[0] for a in added]]
        if candidates:
            visit = RNG.choice(candidates)
            visit.notes = f"{visit.notes} {note}"
            added.append((visit, brand))
    db.flush()
    return added


def create_objectives(db, delegates):
    """
    Objectifs mensuels. On les calcule à partir de l'activité réelle générée,
    divisée par un taux d'atteinte propre à chaque délégué : certains sont
    en avance (> 100 %), d'autres en retard. Pour le mois en cours, on extrapole.
    """
    for user, profile in delegates:
        for period in PERIODS:
            start, end = month_bounds(period)
            in_month = (
                db.query(Visit)
                .filter(Visit.delegue_id == user.id, Visit.status == VisitStatus.REALISEE,
                        Visit.actual_at >= start, Visit.actual_at < end)
                .all()
            )
            fraction = max(elapsed_fraction(period, TODAY), 0.1)
            ratio = RNG.uniform(*profile["achievement"])
            target_visits = max(10, round(len(in_month) / fraction / ratio))

            presentations = Counter(vp.product_id for v in in_month for vp in v.products)
            objective = Objective(
                delegue_id=user.id,
                period=period,
                target_visits=target_visits,
                target_coverage_a=80 if period.endswith("-08") else 90,
            )
            for product_id, count in presentations.most_common(4):
                objective.products.append(ObjectiveProduct(
                    product_id=product_id,
                    target_presentations=max(3, round(count / fraction / (ratio * RNG.uniform(0.9, 1.1)))),
                ))
            db.add(objective)
    db.flush()


def create_alerts(db, delegates):
    """Alertes calculées par les règles métier ; on en marque certaines « vues »."""
    db.commit()
    for user, _ in delegates:
        alert_service.refresh_alerts(db, user.id)
    for alert in db.query(Alert).all():
        if RNG.random() < 0.3:
            alert.status = AlertStatus.VUE
    db.commit()


def write_duplicates_doc(pairs, pv_notes) -> None:
    """Génère seed_duplicates.md (à la racine du dépôt) avec les vrais identifiants."""
    lines = [
        "# Données de démo particulières",
        "",
        "_Fichier généré automatiquement par `backend/seed.py` (les identifiants peuvent changer "
        "si le seed est relancé un autre jour : relisez ce fichier après chaque seed)._",
        "",
        "## 1. Quasi-doublons de médecins (démo de la détection de doublons)",
        "",
        "Chaque paire désigne **le même médecin** saisi deux fois avec une graphie différente "
        "(translittération arabe → français, espaces, accents, format du téléphone). "
        "La fiche « doublon » est récente, souvent créée depuis une carte de visite ou un import.",
        "",
        "| # | Fiche d'origine (id) | Doublon (id) | Ville | Ce qui diffère |",
        "|---|---|---|---|---|",
    ]
    for i, (orig, dup, why) in enumerate(pairs, 1):
        lines.append(
            f"| {i} | {orig.first_name} {orig.last_name} ({orig.id}) — {orig.phone} "
            f"| {dup.first_name} {dup.last_name} ({dup.id}) — {dup.phone} "
            f"| {orig.city} | {why} |"
        )
    lines += [
        "",
        "## 2. Comptes-rendus mentionnant un effet indésirable (démo pharmacovigilance)",
        "",
        "Ces visites contiennent dans leurs notes une mention d'effet indésirable. "
        "Le futur module `app/ai/pharmacovigilance.py` devra les détecter.",
        "",
        "| Visite (id) | Médecin | Produit | Date |",
        "|---|---|---|---|",
    ]
    for visit, brand in pv_notes:
        lines.append(f"| {visit.id} | {visit.doctor.full_name} | {brand} | {visit.actual_at:%d/%m/%Y} |")
    (REPO_ROOT / "seed_duplicates.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    print("→ Réinitialisation de la base noor.db ...")
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    with SessionLocal() as db:
        supervisor, delegates = create_users(db)
        products = create_products(db)
        by_delegate, pairs = create_doctors(db, delegates, products)
        create_visits(db, delegates, by_delegate, products, pairs)
        pv_notes = add_pharmacovigilance_notes(db)
        create_objectives(db, delegates)
        create_alerts(db, delegates)
        write_duplicates_doc(pairs, pv_notes)

        # Résumé
        n_doctors = db.query(Doctor).count()
        n_visits = db.query(Visit).count()
        status_counts = Counter(s for (s,) in db.query(Visit.status).all())
        print(f"✓ {1 + len(delegates)} utilisateurs, {len(products)} produits, {n_doctors} médecins "
              f"({len(pairs)} doublons volontaires)")
        print(f"✓ {n_visits} visites du {HISTORY_START:%d/%m/%Y} au "
              f"{TODAY + timedelta(days=PLANNING_DAYS):%d/%m/%Y} : {dict(status_counts)}")
        print(f"✓ {db.query(Objective).count()} objectifs mensuels, {db.query(Alert).count()} alertes")
        print(f"✓ {len(pv_notes)} notes de pharmacovigilance, seed_duplicates.md généré")
        print("\nComptes de démo (mot de passe : demo) :")
        print(f"  Superviseur : {supervisor.email}")
        for user, _ in delegates:
            print(f"  Délégué     : {user.email}  ({user.region})")


if __name__ == "__main__":
    main()
