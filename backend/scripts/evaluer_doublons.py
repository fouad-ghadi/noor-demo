"""
Évaluation de la détection des doublons sur la base de démo.

    cd backend
    python scripts/evaluer_doublons.py

Vérité terrain : les 10 paires de quasi-doublons ajoutées volontairement par le seed
(seed.py, DUPLICATES : Ouazzani / Wazzani, El Amrani / Elamrani...). Toutes les autres
fiches sont des médecins différents (~860 fiches, ~70 000 comparaisons dans une même ville).
    - rappel    = paires trouvées / 10
    - précision = vraies paires / paires signalées
"""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # pour importer « app » et « seed »

from app.database import SessionLocal  # noqa: E402
from app.services.duplicate_service import find_all_pairs  # noqa: E402
from seed import DUPLICATES  # noqa: E402

truth = {(v.get("first_name", o["first_name"]), v.get("last_name", o["last_name"])) for _, o, v, _ in DUPLICATES}

with SessionLocal() as db:
    start = time.perf_counter()
    pairs = find_all_pairs(db)
    elapsed = time.perf_counter() - start

found = [(a, b, score, reasons) for a, b, score, reasons in pairs if (b.first_name, b.last_name) in truth]
false_alerts = [(a, b, score, reasons) for a, b, score, reasons in pairs if (b.first_name, b.last_name) not in truth]

print(f"Paires signalées : {len(pairs)} (en {elapsed:.1f} s)")
print(f"Rappel    : {len(found)}/{len(truth)} = {100 * len(found) / len(truth):.0f} %")
print(f"Précision : {len(found)}/{len(pairs)} = {100 * len(found) / max(1, len(pairs)):.0f} %")
print()
for a, b, score, reasons in found:
    print(f"  ✓ {score:.2f}  {a.first_name} {a.last_name} (id {a.id}) / {b.first_name} {b.last_name} (id {b.id})")
    print(f"           {' ; '.join(reasons)}")
for a, b, score, reasons in false_alerts:
    print(f"  ✗ {score:.2f}  {a.first_name} {a.last_name} / {b.first_name} {b.last_name} : {' ; '.join(reasons)}")
