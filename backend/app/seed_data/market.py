"""
Marchés et concurrents (TOUT est fictif : noms de produits, laboratoires, chiffres).

Pour chaque produit du laboratoire : son marché (classe thérapeutique, code de type
ATC/EphMRA simplifié), ses concurrents, la taille du marché et la part de marché
de départ. Le seed en tire 3 ans de ventes mensuelles par territoire.
"""

# Laboratoires concurrents imaginaires
LABS = ["Atlas Pharma", "Médinova", "Pharmagreb", "Biosana", "Labo Oasis", "Zénith Santé"]

# brand (notre produit) -> caractéristiques du marché
#   market_code / market_name : classe du marché
#   monthly_value : taille du marché national par mois (dirhams)
#   share : part de marché nationale de notre produit au départ (0-1)
#   trend : évolution annuelle de notre part de marché (ex. +0.05 = +5 % par an)
#   price : prix public moyen d'une boîte (dirhams)
#   seasonal : marché saisonnier (pic en hiver : infections, fièvre, asthme)
#   competitors : (nom, laboratoire)
MARKETS: dict[str, dict] = {
    "Cardiovex": dict(market_code="C08A0", market_name="Inhibiteurs calciques", monthly_value=2_400_000,
                      share=0.34, trend=0.05, price=48, seasonal=False,
                      competitors=[("Tensilor", "Atlas Pharma"), ("Calcivane", "Médinova"),
                                   ("Normadip", "Pharmagreb")]),
    "Statilia": dict(market_code="C10A1", market_name="Statines", monthly_value=3_600_000,
                     share=0.28, trend=0.02, price=95, seasonal=False,
                     competitors=[("Lipoxa", "Médinova"), ("Cholvane", "Biosana"), ("Atorine", "Zénith Santé")]),
    "Glucanor": dict(market_code="A10J1", market_name="Biguanides", monthly_value=1_800_000,
                     share=0.41, trend=0.0, price=32, seasonal=False,
                     competitors=[("Glyconor", "Pharmagreb"), ("Metavia", "Labo Oasis")]),
    "Amoxira": dict(market_code="J01C1", market_name="Pénicillines orales à large spectre",
                    monthly_value=4_200_000, share=0.22, trend=-0.04, price=38, seasonal=True,
                    competitors=[("Amoxen", "Atlas Pharma"), ("Pénivar", "Zénith Santé"),
                                 ("Bactilam", "Médinova")]),
    "Gastrozen": dict(market_code="A02B2", market_name="Inhibiteurs de la pompe à protons",
                      monthly_value=3_000_000, share=0.31, trend=0.03, price=62, seasonal=False,
                      competitors=[("Gastril", "Biosana"), ("Prazolis", "Pharmagreb"), ("Acidor", "Labo Oasis")]),
    "Respiflow": dict(market_code="R03A2", market_name="Bêta-2 agonistes inhalés", monthly_value=1_500_000,
                      share=0.37, trend=-0.02, price=45, seasonal=True,
                      competitors=[("Aerolan", "Médinova"), ("Spirax", "Atlas Pharma")]),
    "Calmapyr": dict(market_code="N02B0", market_name="Antalgiques non narcotiques", monthly_value=5_000_000,
                     share=0.18, trend=0.01, price=18, seasonal=True,
                     competitors=[("Fébrinol", "Zénith Santé"), ("Algopar", "Pharmagreb"),
                                  ("Douleran", "Biosana")]),
    "Artrinol": dict(market_code="M01A1", market_name="Anti-inflammatoires non stéroïdiens",
                     monthly_value=2_600_000, share=0.26, trend=-0.03, price=29, seasonal=False,
                     competitors=[("Inflamil", "Labo Oasis"), ("Rhumadex", "Atlas Pharma"),
                                  ("Flexalgan", "Médinova")]),
    "Cutalis": dict(market_code="D07A0", market_name="Dermocorticoïdes", monthly_value=1_100_000,
                    share=0.33, trend=0.04, price=41, seasonal=False,
                    competitors=[("Dermacort", "Biosana"), ("Cutisone", "Zénith Santé")]),
    "Gestavia": dict(market_code="B03A2", market_name="Fer et associations", monthly_value=1_400_000,
                     share=0.39, trend=0.06, price=54, seasonal=False,
                     competitors=[("Ferrolia", "Pharmagreb"), ("Martiale", "Labo Oasis")]),
}

# Évolution annuelle de notre part de marché par territoire (s'ajoute à celle du produit).
# Elle reflète les profils des délégués : en avance (Casablanca), dans les temps (Rabat-Salé),
# en retard (Marrakech, Fès Médina). Territoires absents : tirés au hasard entre -4 % et +4 %.
TERRITORY_TREND: dict[str, float] = {
    "Casa Anfa": 0.07, "Casa Est": 0.04, "Casa Sud": 0.05, "Mohammedia": 0.02,
    "Rabat Centre": 0.02, "Rabat Sud": 0.0, "Salé": 0.01, "Témara": -0.02,
    "Marrakech Guéliz": -0.05, "Marrakech Médina": -0.08, "Safi": -0.03,
    "Fès VN": 0.02, "Fès Médina": -0.07, "Meknès": 0.03,
}
