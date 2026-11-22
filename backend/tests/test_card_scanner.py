"""
Tests du scan de carte de visite et de la détection des doublons.

    python -m pytest tests/test_card_scanner.py -v
"""
import pytest

from app.ai import card_scanner, llm
from app.services import duplicate_service as ds
from tests.conftest import headers

# Textes tels que l'OCR du navigateur les lit sur les cartes d'exemple (frontend/public/demo-cards/)
CARD_WAZZANI = """Dr Youssef WAZZANI
Pneumo-Allergologue
Maladies respiratoires et allergies
8, Av. de France
Agdal - Rabat
Tél : 05 37 77 18 42
Sur rendez-vous"""

CARD_ELAMRANI = """Dr Mohamed ELAMRANI
Cardiologue
Maladies du coeur et des vaisseaux
45, Bd Zerktouni
Maârif - Casablanca
Tél : +212 522-251478
GSM : 06 61 90 12 34"""

CARD_ETTAHIRI = """Dr Saïd ETTAHIRI
Rhumatologue
Ostéoporose - Rhumatismes
5, Rue Ibn Aïcha
Daoudiate - Marrakech
GSM : +212 668 127 730
dr.ettahiri@gmail.com"""

CARD_BENNIS = """Dr Leïla BENNIS
Pédiatre
Nourrissons et enfants
Résidence Anfa Place, Bd d'Anfa
Anfa - Casablanca
Tél : 05 22 39 40 41
dr.bennis.pediatre@gmail.com"""


# ---------------------------------------------------------------------------
# Normalisation (sans base de données)
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("a, b", [
    ("05 22 25 14 78", "+212 522-251478"),
    ("0522473012", "05 22 47 30 12"),
    ("05.37.65.43.29", "0537654329"),
    ("+212 668 127 730", "06 68 12 77 30"),
    ("00212 6 71 55 03 26", "0671550326"),
])
def test_meme_telephone_quel_que_soit_le_format(a, b):
    assert ds.phone_key(a) == ds.phone_key(b)


@pytest.mark.parametrize("a, b", [
    ("El Amrani", "Elamrani"),
    ("Benjelloun", "Ben Jelloun"),
    ("Ouazzani", "Wazzani"),
    ("Chraibi", "Chraïbi"),
    ("El Idrissi", "Idrissi"),
    ("Tahiri", "Ettahiri"),
    ("Sqalli", "Skalli"),
])
def test_noms_ecrits_autrement_ont_la_meme_cle(a, b):
    assert ds.last_name_key(a) == ds.last_name_key(b)


def test_prenoms_translitteres():
    assert ds.first_name_key("Mohammed") == ds.first_name_key("Mohamed")
    assert ds.first_name_key("Fatima Zahra") == ds.first_name_key("Fatima-Zahra")
    assert ds.similarity(ds.first_name_key("Noureddine"), ds.first_name_key("Nourdine")) > 0.85


def test_noms_differents_restent_differents():
    assert ds.last_name_key("Alaoui") != ds.last_name_key("Slaoui")
    assert ds.last_name_key("Lahlou") != ds.last_name_key("Lazrak")


# ---------------------------------------------------------------------------
# Lecture d'une carte par les règles (texte de l'OCR → champs)
# ---------------------------------------------------------------------------

def test_extraction_carte_wazzani():
    fields, uncertain = card_scanner.extract_fields(CARD_WAZZANI)
    assert (fields.first_name, fields.last_name) == ("Youssef", "Wazzani")
    assert fields.specialty == "Pneumologue"
    assert fields.address == "8, Av. de France"
    assert (fields.city, fields.district) == ("Rabat", "Agdal")
    assert fields.phone == "05 37 77 18 42"
    assert fields.practice_type is None  # rien sur la carte : on ne devine pas
    assert uncertain == []


def test_extraction_carte_elamrani_prefere_le_fixe_au_portable():
    fields, _ = card_scanner.extract_fields(CARD_ELAMRANI)
    assert (fields.first_name, fields.last_name) == ("Mohamed", "Elamrani")
    assert fields.specialty == "Cardiologue"
    assert fields.phone == "05 22 25 14 78"   # +212 522-251478 remis au format de la base
    assert (fields.city, fields.district) == ("Casablanca", "Maârif")  # « Maârif » retrouvé


def test_extraction_carte_avec_email_et_mobile():
    fields, _ = card_scanner.extract_fields(CARD_ETTAHIRI)
    assert (fields.first_name, fields.last_name) == ("Saïd", "Ettahiri")
    assert fields.specialty == "Rhumatologue"
    assert fields.phone == "06 68 12 77 30"
    assert fields.email == "dr.ettahiri@gmail.com"
    assert fields.city == "Marrakech"


def test_adresse_garde_les_noms_de_quartier_dans_la_rue():
    fields, _ = card_scanner.extract_fields(CARD_BENNIS)
    assert fields.address == "Résidence Anfa Place, Bd d'Anfa"
    assert (fields.city, fields.district) == ("Casablanca", "Anfa")
    fields, _ = card_scanner.extract_fields("Dr Ali Naciri\nCardiologue\n12, Rue Oued Fès - Agdal, Rabat")
    assert fields.address == "12, Rue Oued Fès"


def test_extraction_texte_bruite_et_sans_ville():
    """OCR imparfait : minuscules, points dans le numéro, pas de ville → déduite de l'indicatif."""
    text = "docteur karim ben jelloun\nmedecine generale\n12 rue jean jaures\ntel. 05.22.47.30.12\nfax 05 22 00 00 00"
    fields, uncertain = card_scanner.extract_fields(text)
    assert (fields.first_name, fields.last_name) == ("Karim", "Ben Jelloun")
    assert fields.specialty == "Généraliste"
    assert fields.phone == "05 22 47 30 12"  # le fax est ignoré
    assert fields.city == "Casablanca" and "city" in uncertain


@pytest.mark.parametrize("text, expected", [
    ("Youssef WAZZANI", ("Youssef", "Wazzani")),
    ("Mohammed El Amrani", ("Mohammed", "El Amrani")),
    ("FATIMA-ZAHRA alaoui", ("Alaoui", "Fatima-Zahra")),  # majuscules = nom de famille
    ("Abdelaziz Ait Lahcen", ("Abdelaziz", "Ait Lahcen")),
])
def test_separation_prenom_nom(text, expected):
    assert card_scanner.split_name(text) == expected


def test_texte_vide():
    fields, uncertain = card_scanner.extract_fields("")
    assert fields.last_name == "" and "last_name" in uncertain


# ---------------------------------------------------------------------------
# Doublons dans la base de démo
# ---------------------------------------------------------------------------

def test_les_10_paires_du_seed_sont_trouvees_sans_fausse_alerte(db):
    """Même évaluation que scripts/evaluer_doublons.py : 10/10, 0 fausse alerte."""
    import seed

    expected = {(v.get("first_name", o["first_name"]), v.get("last_name", o["last_name"]))
                for _, o, v, _ in seed.DUPLICATES}
    pairs = ds.find_all_pairs(db)
    found = {(b.first_name, b.last_name) for _, b, _, _ in pairs}
    assert found == expected
    assert all(score >= 0.85 for _, _, score, _ in pairs)


def test_scan_wazzani_trouve_ouazzani(client, users):
    r = client.post("/api/ai/card-scanner", json={"raw_text": CARD_WAZZANI}, headers=headers(users["salma.berrada"]))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["method"] == "regles"
    names = [m["doctor_name"] for m in body["duplicates"]]
    assert "Dr Youssef Ouazzani" in names and "Dr Youssef Wazzani" in names
    top = body["duplicates"][0]
    assert top["level"] == "tres_probable" and top["in_scope"] is True
    assert any("même téléphone" in reason for reason in top["reasons"])


def test_doublon_chez_un_collegue_est_signale_sans_acces(client, users):
    """Youssef (Casablanca) scanne une carte d'un médecin de Rabat suivi par Salma."""
    r = client.post("/api/ai/card-scanner", json={"raw_text": CARD_WAZZANI},
                    headers=headers(users["youssef.elidrissi"]))
    top = r.json()["duplicates"][0]
    assert top["in_scope"] is False
    assert top["delegue_name"] == "Salma Berrada"


def test_carte_nouveau_medecin_sans_doublon(client, users):
    r = client.post("/api/ai/card-scanner", json={"raw_text": CARD_BENNIS},
                    headers=headers(users["youssef.elidrissi"]))
    body = r.json()
    assert body["doctor"]["last_name"] == "Bennis"
    assert body["duplicates"] == []


def test_sans_cle_ni_texte_le_navigateur_doit_faire_l_ocr(client, users):
    r = client.post("/api/ai/card-scanner", json={"image_base64": "iVBORw0KGgo="},
                    headers=headers(users["salma.berrada"]))
    assert r.status_code == 200
    assert r.json()["needs_ocr"] is True


def test_statut_ia(client, users):
    r = client.get("/api/ai/status", headers=headers(users["salma.berrada"]))
    status = r.json()["card_scanner"]
    assert status["implemented"] is True
    assert status["vision"] is False  # pas de clé pendant les tests


def test_verification_pendant_la_saisie(client, users):
    """Saisie manuelle : le formulaire vérifie les doublons avec les champs tapés."""
    r = client.post("/api/ai/card-scanner/duplicates",
                    json={"first_name": "Mohamed", "last_name": "Elamrani", "city": "Casablanca"},
                    headers=headers(users["youssef.elidrissi"]))
    names = [m["doctor_name"] for m in r.json()]
    assert "Dr Mohammed El Amrani" in names


def test_lecture_par_claude_simulee(client, users, monkeypatch):
    """Avec une clé : Claude lit la photo ; ses réponses sont ramenées au référentiel."""
    monkeypatch.setattr(llm, "is_available", lambda: True)
    monkeypatch.setattr(llm, "ask_json", lambda *a, **k: {
        "raw_text": CARD_WAZZANI, "first_name": "Youssef", "last_name": "Wazzani",
        "specialty": "Pneumo-allergologue", "practice_type": "cabinet", "address": "8, Av. de France",
        "city": "RABAT", "district": "Agdal", "phone": "+212537771842", "email": "",
    })
    r = client.post("/api/ai/card-scanner", json={"image_base64": "iVBORw0KGgo=", "media_type": "image/png"},
                    headers=headers(users["salma.berrada"]))
    body = r.json()
    assert body["method"] == "claude"
    assert body["doctor"]["specialty"] == "Pneumologue"
    assert body["doctor"]["city"] == "Rabat"
    assert body["doctor"]["phone"] == "05 37 77 18 42"
    assert body["doctor"]["email"] is None
    assert body["duplicates"][0]["level"] == "tres_probable"


# ---------------------------------------------------------------------------
# « Compléter la fiche existante »
# ---------------------------------------------------------------------------

def _doctor_id(db, first_name, last_name):
    from sqlalchemy import select

    from app.models import Doctor

    return db.scalar(select(Doctor.id).where(Doctor.first_name == first_name, Doctor.last_name == last_name))


def test_fusion_garde_la_graphie_de_reference(client, db, users):
    card, _ = card_scanner.extract_fields(CARD_WAZZANI)
    doctor_id = _doctor_id(db, "Youssef", "Ouazzani")
    r = client.post("/api/ai/card-scanner/merge", json={"doctor_id": doctor_id, "card": card.model_dump()},
                    headers=headers(users["salma.berrada"]))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["fields"]["last_name"] == "Ouazzani"           # la base reste la référence
    assert "Wazzani" in body["fields"]["notes"]                # la graphie de la carte est notée
    actions = {c["field"]: c["action"] for c in body["changes"]}
    assert actions["last_name"] == "conserve"
    assert "phone" not in actions                              # même numéro : rien à changer


def test_fusion_complete_un_champ_vide_et_garde_l_ancien_telephone(client, db, users):
    doctor_id = _doctor_id(db, "Said", "Tahiri")
    card = {"first_name": "Saïd", "last_name": "Ettahiri", "phone": "06 00 11 22 33", "email": "dr.ettahiri@gmail.com"}
    body = client.post("/api/ai/card-scanner/merge", json={"doctor_id": doctor_id, "card": card},
                       headers=headers(users["hamza.aitlahcen"])).json()
    actions = {c["field"]: c["action"] for c in body["changes"]}
    assert actions["email"] == "ajout"
    assert actions["phone"] == "remplacement"
    assert body["fields"]["phone"] == "06 00 11 22 33"
    assert "Ancien téléphone : 06 68 12 77 30" in body["fields"]["notes"]


def test_fusion_refusee_hors_perimetre(client, db, users):
    doctor_id = _doctor_id(db, "Youssef", "Ouazzani")
    r = client.post("/api/ai/card-scanner/merge", json={"doctor_id": doctor_id, "card": {"last_name": "Wazzani"}},
                    headers=headers(users["youssef.elidrissi"]))
    assert r.status_code == 403


def test_creation_depuis_une_carte_puis_doublon_detecte(client, users):
    """Créer le médecin de la carte, puis rescanner la même carte : la nouvelle fiche est trouvée."""
    user = users["youssef.elidrissi"]
    card = client.post("/api/ai/card-scanner", json={"raw_text": CARD_BENNIS}, headers=headers(user)).json()["doctor"]
    payload = {**{k: v for k, v in card.items() if v is not None}, "source": "carte_de_visite", "segment": "B"}
    r = client.post("/api/doctors", json=payload, headers=headers(user))
    assert r.status_code == 201, r.text
    assert r.json()["source"] == "carte_de_visite"

    again = client.post("/api/ai/card-scanner", json={"raw_text": CARD_BENNIS}, headers=headers(user)).json()
    assert again["duplicates"][0]["doctor_id"] == r.json()["id"]
    assert again["duplicates"][0]["score"] >= 0.95
