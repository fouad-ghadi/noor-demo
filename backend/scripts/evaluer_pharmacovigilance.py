"""
Évaluation du module de pharmacovigilance (méthode par règles) sur la base de démo.

    cd backend
    python scripts/evaluer_pharmacovigilance.py

Vérité terrain : les 7 comptes-rendus auxquels le seed a ajouté une note d'effet
indésirable (app/seed_data/texts.py, PHARMACOVIGILANCE_NOTES). Tous les autres
comptes-rendus n'en contiennent pas.
    - rappel    = effets trouvés / 7
    - précision = vrais effets / comptes-rendus signalés
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # pour importer « app »

from sqlalchemy import select  # noqa: E402

from app.ai.pharmacovigilance import detect, visit_text  # noqa: E402
from app.database import SessionLocal  # noqa: E402
from app.models import Product, Visit  # noqa: E402
from app.models.enums import VisitStatus  # noqa: E402
from app.seed_data.texts import PHARMACOVIGILANCE_NOTES  # noqa: E402

with SessionLocal() as db:
    products = list(db.scalars(select(Product)))
    visits = list(db.scalars(select(Visit).where(Visit.status == VisitStatus.REALISEE)))
    truth = {v.id for v in visits if any(note in (v.notes or "") for _, note in PHARMACOVIGILANCE_NOTES)}
    flagged = {v.id: detect(visit_text(v), products, use_llm=False) for v in visits}
    flagged = {vid: s for vid, s in flagged.items() if s}

    tp = truth & flagged.keys()
    fp = flagged.keys() - truth
    fn = truth - flagged.keys()
    print(f"Comptes-rendus analysés : {len(visits)}")
    print(f"Effets réels : {len(truth)}  |  signalés : {len(flagged)}")
    print(f"Rappel    : {len(tp)}/{len(truth)} = {100 * len(tp) / max(1, len(truth)):.0f} %")
    print(f"Précision : {len(tp)}/{len(flagged)} = {100 * len(tp) / max(1, len(flagged)):.0f} %")
    for vid in sorted(tp):
        s = flagged[vid][0]
        print(f"  ✓ visite {vid} : {s.event} ({s.product_name}, {s.seriousness})")
    for vid in sorted(fp):
        print(f"  ✗ fausse alerte, visite {vid} : {flagged[vid][0].excerpt}")
    for vid in sorted(fn):
        print(f"  ✗ effet manqué, visite {vid}")
