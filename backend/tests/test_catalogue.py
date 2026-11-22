"""
Catalogue médicaments (page /produits du frontend) : l'API doit fournir tout ce que
la page affiche, et chaque produit doit avoir son visuel généré (Higgsfield).
"""
from pathlib import Path

from tests.conftest import headers

PUBLIC_PRODUCTS = Path(__file__).resolve().parents[2] / "frontend" / "public" / "products"


def test_api_produits_fournit_les_champs_du_catalogue(client, users):
    r = client.get("/api/products", headers=headers(users["salma"]))
    assert r.status_code == 200
    produits = r.json()
    assert len(produits) == 10
    for p in produits:
        # Gamme : sert aux filtres du catalogue
        assert p["product_line"], p["brand_name"]
        assert p["business_unit"] in {"chronique", "aigue"}
        # Au moins 3 messages clés pour le mode « Présenter au médecin »
        assert len(p["key_messages"]) >= 3, p["brand_name"]
        assert p["indications"] and p["form_dosage"]


def test_chaque_produit_a_son_visuel(client, users):
    produits = client.get("/api/products", headers=headers(users["salma"])).json()
    for p in produits:
        fichier = PUBLIC_PRODUCTS / f"{p['brand_name'].lower()}.webp"
        assert fichier.exists(), f"Visuel manquant : {fichier.name}"
