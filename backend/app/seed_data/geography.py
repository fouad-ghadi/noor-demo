"""
Géographie réelle utilisée par le seed : régions, villes, quartiers, rues.

Les coordonnées GPS sont le centre approximatif de chaque quartier ;
le seed ajoute un petit décalage aléatoire pour chaque cabinet.
"""

# Pour chaque région : liste de (ville, quartier, latitude, longitude, indicatif téléphonique fixe)
REGIONS: dict[str, list[tuple[str, str, float, float, str]]] = {
    "Casablanca": [
        ("Casablanca", "Maârif", 33.5853, -7.6325, "0522"),
        ("Casablanca", "Gauthier", 33.5926, -7.6262, "0522"),
        ("Casablanca", "Racine", 33.5895, -7.6395, "0522"),
        ("Casablanca", "Anfa", 33.5936, -7.6580, "0522"),
        ("Casablanca", "Bourgogne", 33.5995, -7.6410, "0522"),
        ("Casablanca", "Hay Hassani", 33.5662, -7.6745, "0522"),
        ("Casablanca", "Aïn Sebaâ", 33.6075, -7.5390, "0522"),
        ("Casablanca", "Sidi Maârouf", 33.5360, -7.6410, "0522"),
        ("Casablanca", "Hay Mohammadi", 33.5876, -7.5705, "0522"),
        ("Casablanca", "Derb Sultan", 33.5795, -7.6010, "0522"),
        ("Casablanca", "Oulfa", 33.5540, -7.6790, "0522"),
        ("Mohammedia", "Centre-ville", 33.6866, -7.3830, "0523"),
    ],
    "Rabat-Salé": [
        ("Rabat", "Agdal", 33.9985, -6.8510, "0537"),
        ("Rabat", "Hassan", 34.0195, -6.8350, "0537"),
        ("Rabat", "Hay Riad", 33.9605, -6.8695, "0537"),
        ("Rabat", "Souissi", 33.9840, -6.8290, "0537"),
        ("Rabat", "L'Océan", 34.0250, -6.8490, "0537"),
        ("Rabat", "Yacoub El Mansour", 34.0005, -6.8805, "0537"),
        ("Salé", "Tabriquet", 34.0455, -6.8000, "0537"),
        ("Salé", "Bettana", 34.0400, -6.8150, "0537"),
        ("Salé", "Hay Salam", 34.0290, -6.7790, "0537"),
        ("Témara", "Centre-ville", 33.9280, -6.9065, "0537"),
    ],
    "Marrakech": [
        ("Marrakech", "Guéliz", 31.6345, -8.0095, "0524"),
        ("Marrakech", "Hivernage", 31.6225, -8.0150, "0524"),
        ("Marrakech", "Médina", 31.6295, -7.9890, "0524"),
        ("Marrakech", "Daoudiate", 31.6505, -8.0045, "0524"),
        ("Marrakech", "Massira", 31.6080, -8.0600, "0524"),
        ("Marrakech", "Sidi Youssef Ben Ali", 31.6100, -7.9750, "0524"),
        ("Marrakech", "Targa", 31.6500, -8.0500, "0524"),
        ("Safi", "Centre-ville", 32.2994, -9.2372, "0524"),
    ],
    "Fès-Meknès": [
        ("Fès", "Ville Nouvelle", 34.0395, -5.0005, "0535"),
        ("Fès", "Atlas", 34.0300, -4.9900, "0535"),
        ("Fès", "Narjiss", 34.0150, -4.9700, "0535"),
        ("Fès", "Saïss", 34.0050, -5.0100, "0535"),
        ("Fès", "Route d'Imouzzer", 34.0100, -5.0000, "0535"),
        ("Fès", "Fès Médina", 34.0640, -4.9730, "0535"),
        ("Meknès", "Hamria", 33.8950, -5.5400, "0535"),
        ("Meknès", "Marjane", 33.8700, -5.5700, "0535"),
        ("Meknès", "Ville Nouvelle", 33.8920, -5.5530, "0535"),
    ],
}

# Rues réalistes par ville (pour générer des adresses)
STREETS: dict[str, list[str]] = {
    "Casablanca": [
        "Bd Zerktouni", "Bd d'Anfa", "Rue Ibnou Mounir", "Bd Ghandi", "Bd Abdelmoumen",
        "Rue Jean Jaurès", "Bd Brahim Roudani", "Bd de la Résistance", "Av. Hassan II",
        "Bd Al Massira Al Khadra", "Rue Abou Kacem Echabi", "Bd Bir Anzarane",
    ],
    "Mohammedia": ["Av. Hassan II", "Bd Mohammed V", "Rue Farhat Hachad"],
    "Rabat": [
        "Av. de France", "Av. Fal Ould Oumeir", "Av. Mohammed V", "Rue Patrice Lumumba",
        "Av. Annakhil", "Av. Allal Ben Abdellah", "Av. Mohammed VI", "Rue Oued Fès",
    ],
    "Salé": ["Av. Hassan II", "Bd Lalla Aïcha", "Av. Mohammed V"],
    "Témara": ["Av. Hassan II", "Av. Mohammed V"],
    "Marrakech": [
        "Av. Mohammed V", "Rue de Yougoslavie", "Av. Hassan II", "Bd Abdelkrim Khattabi",
        "Rue Ibn Aïcha", "Av. Allal El Fassi", "Bd Mohammed VI", "Rue Tarik Ibn Ziad",
    ],
    "Safi": ["Av. Moulay Youssef", "Bd Mohammed V"],
    "Fès": [
        "Av. Hassan II", "Bd Mohammed V", "Av. des FAR", "Rue Abou Bakr Seddik",
        "Av. Allal Ben Abdellah", "Bd Moulay Youssef", "Av. Lalla Meryem",
    ],
    "Meknès": ["Av. des FAR", "Bd Allal Ben Abdellah", "Av. Mohammed V", "Rue Antsirabé"],
}

# Établissements pour les médecins exerçant en clinique ou hôpital public
FACILITIES: dict[str, dict[str, list[str]]] = {
    "Casablanca": {
        "clinique": ["Clinique Les Palmiers", "Clinique Al Madina", "Clinique Anfa Santé"],
        "hopital_public": ["CHU Ibn Rochd", "Hôpital Moulay Youssef"],
    },
    "Mohammedia": {"clinique": ["Clinique Al Wahda"], "hopital_public": ["Hôpital Moulay Abdellah"]},
    "Rabat": {
        "clinique": ["Clinique Agdal Santé", "Clinique Al Irfane"],
        "hopital_public": ["CHU Ibn Sina", "Hôpital d'Enfants de Rabat"],
    },
    "Salé": {"clinique": ["Clinique Bab Sebta"], "hopital_public": ["Hôpital Moulay Abdellah"]},
    "Témara": {"clinique": ["Clinique Témara Santé"], "hopital_public": ["Hôpital préfectoral de Témara"]},
    "Marrakech": {
        "clinique": ["Clinique Al Koutoubia", "Clinique Guéliz Santé"],
        "hopital_public": ["CHU Mohammed VI", "Hôpital Ibn Tofail"],
    },
    "Safi": {"clinique": ["Clinique Atlantique"], "hopital_public": ["Hôpital Mohammed V"]},
    "Fès": {
        "clinique": ["Clinique Al Fath", "Clinique Saïss Santé"],
        "hopital_public": ["CHU Hassan II", "Hôpital Al Ghassani"],
    },
    "Meknès": {"clinique": ["Clinique Ismaïlia"], "hopital_public": ["Hôpital Mohammed V"]},
}
