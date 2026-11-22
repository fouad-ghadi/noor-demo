"""
Détection par règles (sans clé API) : effets indésirables, situations particulières,
patient identifiable, et absence de fausses alertes sur les textes « normaux » du seed.
"""
import pytest

from app.ai.pharmacovigilance import detect, patient_details
from app.models import Product
from app.seed_data import texts

PRODUCTS = [
    Product(id=1, brand_name="Calmapyr", molecule="Paracétamol"),
    Product(id=2, brand_name="Amoxira", molecule="Amoxicilline"),
    Product(id=3, brand_name="Cardiovex", molecule="Amlodipine"),
    Product(id=4, brand_name="Glucanor", molecule="Metformine"),
    Product(id=5, brand_name="Gastrozen", molecule="Oméprazole"),
]


def test_effet_indesirable_avec_patient_identifiable():
    [s] = detect("Le docteur signale qu'une patiente de 34 ans a présenté une éruption cutanée "
                 "2 jours après le début d'Amoxira.", PRODUCTS, use_llm=False)
    assert s.kind == "effet_indesirable"
    assert s.product_name == "Amoxira"
    assert "éruption cutanée" in s.event
    assert s.patient == "femme, 34 ans"
    assert s.seriousness == "non_grave"


def test_effet_grave_si_hospitalisation():
    [s] = detect("Patient hospitalisé pour méléna sous Calmapyr.", PRODUCTS, use_llm=False)
    assert s.seriousness == "grave"
    assert s.patient is None  # « patient » seul ne suffit pas à l'identifier


@pytest.mark.parametrize("text, situation", [
    ("Le docteur signale qu'une patiente de 29 ans traitée par Cardiovex vient d'apprendre qu'elle est enceinte.",
     "grossesse_allaitement"),
    ("Une patiente allaite son bébé et prend Amoxira depuis 3 jours.", "grossesse_allaitement"),
    ("Le docteur signale qu'un patient a pris 12 comprimés de Calmapyr 1 g en une journée.", "surdosage"),
    ("Le docteur signale un mésusage : un homme de 52 ans prend Gastrozen depuis un an sans avis médical.",
     "mesusage"),
    ("Le Dr rapporte une erreur de dispensation : Glucanor 1000 mg remis au lieu de 500 mg à une patiente.",
     "erreur_medicamenteuse"),
    ("Chez un enfant de 4 ans sous Amoxira, aucune amélioration après 7 jours de traitement.",
     "manque_efficacite"),
])
def test_situations_particulieres(text, situation):
    [s] = detect(text, PRODUCTS, use_llm=False)
    assert s.kind == "situation_particuliere"
    assert s.situations == [situation]
    assert s.product_in_text


def test_effet_et_situation_dans_la_meme_phrase():
    [s] = detect("Une patiente enceinte se plaint de nausées sous Amoxira.", PRODUCTS, use_llm=False)
    assert s.kind == "effet_indesirable"
    assert s.situations == ["grossesse_allaitement"]


@pytest.mark.parametrize("text", [
    "Craint les œdèmes des membres inférieurs à forte dose de Cardiovex.",   # simple crainte
    "Prescrit Amoxira à ses patientes enceintes sans problème.",            # généralité, pas un cas
    "Inquiet du risque de surdosage de Calmapyr chez les personnes âgées.",  # hypothèse
    "Demande des données d'efficacité publiées récentes sur Glucanor.",      # question
])
def test_pas_de_fausse_alerte(text):
    assert detect(text, PRODUCTS, use_llm=False) == []


def test_aucun_texte_normal_du_seed_ne_declenche_d_alerte():
    """Les notes et commentaires « ordinaires » générés par le seed ne sont jamais signalés."""
    phrases = texts.NOTES_POSITIVE + texts.NOTES_NEUTRAL + texts.NOTES_RESERVED + texts.NEXT_STEPS
    phrases += [c for comments in texts.OBJECTION_COMMENTS.values() for c in comments]
    for phrase in phrases:
        for product in PRODUCTS:
            text = phrase.format(p=product.brand_name, slot="le matin")
            assert detect(text, PRODUCTS, use_llm=False) == [], text


@pytest.mark.parametrize("text, expected", [
    ("une patiente de 34 ans", "femme, 34 ans"),
    ("chez son enfant de 7 ans", "enfant, 7 ans"),
    ("deux patients âgés", "patient âgé"),
    ("un homme, initiales A.B.", "homme, initiales A.B."),
    ("un patient", None),
])
def test_patient_identifiable(text, expected):
    assert patient_details(text) == expected
