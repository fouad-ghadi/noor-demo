"""
Évaluation du module de pharmacovigilance (méthode par règles) sur la base de démo.

    cd backend
    python scripts/evaluer_pharmacovigilance.py

Vérité terrain : les 12 comptes-rendus auxquels le seed a ajouté une note à déclarer
(app/seed_data/texts.py) : 7 effets indésirables (PHARMACOVIGILANCE_NOTES) et
5 situations particulières (PHARMACOVIGILANCE_SITUATION_NOTES : surdosage, grossesse,
erreur médicamenteuse, mésusage, manque d'efficacité). Les autres comptes-rendus n'en contiennent pas.
    - rappel    = cas trouvés / 12
    - précision = vrais cas / comptes-rendus signalés
On vérifie aussi que la bonne nature est trouvée (effet indésirable / situation particulière).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # pour importer « app »

from sqlalchemy import select  # noqa: E402

from app.ai.pharmacovigilance import detect, visit_text  # noqa: E402
from app.database import SessionLocal  # noqa: E402
from app.models import Product, Visit  # noqa: E402
from app.models.enums import VisitStatus  # noqa: E402
from app.seed_data.texts import PHARMACOVIGILANCE_NOTES, PHARMACOVIGILANCE_SITUATION_NOTES  # noqa: E402

with SessionLocal() as db:
    products = list(db.scalars(select(Product)))
    visits = list(db.scalars(select(Visit).where(Visit.status == VisitStatus.REALISEE)))
    # visite → nature attendue
    truth = {}
    for v in visits:
        if any(note in (v.notes or "") for _, note in PHARMACOVIGILANCE_NOTES):
            truth[v.id] = "effet_indesirable"
        elif any(note in (v.notes or "") for _, note in PHARMACOVIGILANCE_SITUATION_NOTES):
            truth[v.id] = "situation_particuliere"
    flagged = {v.id: detect(visit_text(v), products, use_llm=False) for v in visits}
    flagged = {vid: s for vid, s in flagged.items() if s}

    tp = truth.keys() & flagged.keys()
    fp = flagged.keys() - truth
    fn = truth.keys() - flagged.keys()
    right_kind = [vid for vid in tp if flagged[vid][0].kind == truth[vid]]
    print(f"Comptes-rendus analysés : {len(visits)}")
    print(f"Cas réels : {len(truth)}  |  signalés : {len(flagged)}")
    print(f"Rappel    : {len(tp)}/{len(truth)} = {100 * len(tp) / max(1, len(truth)):.0f} %")
    print(f"Précision : {len(tp)}/{len(flagged)} = {100 * len(tp) / max(1, len(flagged)):.0f} %")
    print(f"Bonne nature (effet / situation) : {len(right_kind)}/{len(tp)}")
    for vid in sorted(tp):
        s = flagged[vid][0]
        nature = "effet" if s.kind == "effet_indesirable" else "situation"
        print(f"  ✓ visite {vid} : {nature}, {s.event} ({s.product_name}, {s.seriousness}, patient : {s.patient or 'non identifié'})")
    for vid in sorted(fp):
        print(f"  ✗ fausse alerte, visite {vid} : {flagged[vid][0].excerpt}")
    for vid in sorted(fn):
        print(f"  ✗ effet manqué, visite {vid}")
