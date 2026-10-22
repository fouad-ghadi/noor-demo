"""
Territoires de vente (secteurs « IMS »).

Un territoire regroupe des quartiers ou des villes ; chaque délégué couvre les
territoires de sa région. Les ventes du marché (analyse des ventes) sont suivies
par territoire. Les territoires sans délégué de l'équipe (« region » = None)
n'apparaissent que dans les totaux nationaux.

`weight` : taille relative du marché pharmaceutique du territoire (fictive).
"""

# (nom, région du délégué ou None, [(ville, quartier ou None = toute la ville)], poids)
TERRITORIES: list[tuple[str, str | None, list[tuple[str, str | None]], float]] = [
    ("Casa Anfa", "Casablanca",
     [("Casablanca", "Maârif"), ("Casablanca", "Racine"), ("Casablanca", "Anfa"),
      ("Casablanca", "Bourgogne"), ("Casablanca", "Gauthier")], 9.0),
    ("Casa Est", "Casablanca",
     [("Casablanca", "Aïn Sebaâ"), ("Casablanca", "Hay Mohammadi"), ("Casablanca", "Derb Sultan")], 7.0),
    ("Casa Sud", "Casablanca",
     [("Casablanca", "Hay Hassani"), ("Casablanca", "Oulfa"), ("Casablanca", "Sidi Maârouf")], 6.0),
    ("Mohammedia", "Casablanca", [("Mohammedia", None)], 3.0),
    ("Rabat Centre", "Rabat-Salé",
     [("Rabat", "Agdal"), ("Rabat", "Hassan"), ("Rabat", "L'Océan")], 5.0),
    ("Rabat Sud", "Rabat-Salé",
     [("Rabat", "Hay Riad"), ("Rabat", "Souissi"), ("Rabat", "Yacoub El Mansour")], 4.0),
    ("Salé", "Rabat-Salé", [("Salé", None)], 5.0),
    ("Témara", "Rabat-Salé", [("Témara", None)], 2.5),
    ("Marrakech Guéliz", "Marrakech",
     [("Marrakech", "Guéliz"), ("Marrakech", "Hivernage"), ("Marrakech", "Daoudiate"),
      ("Marrakech", "Targa")], 5.0),
    ("Marrakech Médina", "Marrakech",
     [("Marrakech", "Médina"), ("Marrakech", "Sidi Youssef Ben Ali"), ("Marrakech", "Massira")], 4.0),
    ("Safi", "Marrakech", [("Safi", None)], 2.5),
    ("Fès VN", "Fès-Meknès",
     [("Fès", "Ville Nouvelle"), ("Fès", "Atlas"), ("Fès", "Narjiss"), ("Fès", "Saïss"),
      ("Fès", "Route d'Imouzzer")], 5.0),
    ("Fès Médina", "Fès-Meknès", [("Fès", "Fès Médina")], 3.0),
    ("Meknès", "Fès-Meknès", [("Meknès", None)], 4.0),
    # Reste du Maroc : seulement dans les totaux nationaux
    ("Tanger", None, [], 6.0),
    ("Tétouan", None, [], 3.0),
    ("Oujda", None, [], 3.5),
    ("Nador", None, [], 2.0),
    ("Agadir", None, [], 4.5),
    ("Kénitra", None, [], 3.0),
    ("El Jadida", None, [], 2.5),
    ("Béni Mellal", None, [], 2.5),
    ("Khouribga", None, [], 1.8),
    ("Settat", None, [], 1.5),
    ("Errachidia", None, [], 1.2),
    ("Laâyoune", None, [], 1.5),
]


def territory_of(city: str, district: str | None) -> str:
    """Territoire d'un cabinet : quartier précis d'abord, puis ville entière, sinon le nom de la ville."""
    for name, _, places, _ in TERRITORIES:
        if (city, district) in places:
            return name
    for name, _, places, _ in TERRITORIES:
        if (city, None) in places:
            return name
    return city


def territories_of_region(region: str) -> list[str]:
    """Territoires couverts par le délégué d'une région."""
    return [name for name, reg, _, _ in TERRITORIES if reg == region]
