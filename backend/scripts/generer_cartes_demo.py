"""
Génère les cartes de visite FICTIVES utilisées pour la démonstration du scan
(frontend/public/demo-cards/*.png). Les images sont déjà dans le dépôt : ce script
ne sert qu'à les refaire ou à en ajouter.

    cd backend
    pip install pillow
    python scripts/generer_cartes_demo.py

Trois cartes correspondent à des médecins déjà en base écrits autrement (doublons à détecter),
la quatrième à un médecin nouveau (aucun doublon).
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parents[2] / "frontend" / "public" / "demo-cards"

PINE = (15, 61, 62)
MINT = (207, 237, 231)
INK = (28, 33, 33)
GREY = (92, 104, 104)

# Polices : Inter si elle est installée (Linux), sinon Arial (Windows), sinon la police par défaut
FONT_CANDIDATES = {
    "bold": ["/usr/share/fonts/opentype/inter/Inter-Bold.otf", "C:/Windows/Fonts/arialbd.ttf", "arialbd.ttf"],
    "regular": ["/usr/share/fonts/opentype/inter/Inter-Regular.otf", "C:/Windows/Fonts/arial.ttf", "arial.ttf"],
}


def font(kind: str, size: int) -> ImageFont.FreeTypeFont:
    for path in FONT_CANDIDATES[kind]:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default(size)


# Chaque carte : fichier, titre + nom, lignes de spécialité, lignes d'adresse, lignes de contact
CARDS = [
    ("carte-wazzani.png", "Dr Youssef WAZZANI",
     ["Pneumo-Allergologue", "Centre de pneumologie Agdal"],
     ["8, Av. de France", "Agdal - Rabat"],
     ["Tél : 05 37 77 18 42", "Sur rendez-vous"]),
    ("carte-elamrani.png", "Dr Mohamed ELAMRANI",
     ["Cardiologue", "Cabinet de cardiologie Zerktouni"],
     ["45, Bd Zerktouni", "Maârif - Casablanca"],
     ["Tél : +212 522-251478", "GSM : 06 61 90 12 34"]),
    ("carte-ettahiri.png", "Dr Saïd ETTAHIRI",
     ["Rhumatologue", "Ostéoporose - Rhumatismes"],
     ["5, Rue Ibn Aïcha", "Daoudiate - Marrakech"],
     ["GSM : +212 668 127 730", "dr.ettahiri@gmail.com"]),
    ("carte-bennis.png", "Dr Leïla BENNIS",
     ["Pédiatre", "Clinique Les Orangers"],
     ["Résidence Anfa Place, Bd d'Anfa", "Anfa - Casablanca"],
     ["Tél : 05 22 39 40 41", "dr.bennis.pediatre@gmail.com"]),
]


def draw_card(filename: str, name: str, specialty: list[str], address: list[str], contact: list[str]) -> None:
    width, height = 1050, 600
    img = Image.new("RGB", (width, height), "white")
    d = ImageDraw.Draw(img)
    # Bandeau vert à gauche avec une croix de pharmacie stylisée
    d.rectangle([0, 0, 190, height], fill=PINE)
    cx, cy, arm = 95, 300, 22
    d.rectangle([cx - arm, cy - 3 * arm, cx + arm, cy + 3 * arm], fill=MINT)
    d.rectangle([cx - 3 * arm, cy - arm, cx + 3 * arm, cy + arm], fill=MINT)

    x = 240
    d.text((x, 70), name, font=font("bold", 54), fill=INK)
    y = 150
    for i, line in enumerate(specialty):
        d.text((x, y), line, font=font("bold" if i == 0 else "regular", 34 if i == 0 else 28),
               fill=PINE if i == 0 else GREY)
        y += 46
    d.line([x, y + 20, width - 60, y + 20], fill=MINT, width=3)
    y += 50
    for line in address:
        d.text((x, y), line, font=font("regular", 30), fill=INK)
        y += 42
    y += 14
    for line in contact:
        d.text((x, y), line, font=font("regular", 30), fill=INK)
        y += 42
    OUT.mkdir(parents=True, exist_ok=True)
    img.save(OUT / filename, optimize=True)
    print("écrit :", OUT / filename)


if __name__ == "__main__":
    for card in CARDS:
        draw_card(*card)
