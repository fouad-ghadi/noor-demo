"""
Tests des demandes du laboratoire partenaire (novembre 2026) :
potentiel A/B/C expliqué, « Préparer la visite », « Remplir ma semaine »,
conclusions de l'analyse des ventes, clôture de la journée / du mois, fiches médicales.
"""
from datetime import timedelta

from sqlalchemy import select

from app.models import Doctor, Visit
from tests.conftest import headers


def _a_doctor(db, user) -> Doctor:
    return db.scalars(select(Doctor).where(Doctor.delegue_id == user.id).order_by(Doctor.id)).first()


# --- Potentiel A / B / C ------------------------------------------------------------------

def test_potentiel_explique(client, db, users):
    doctor = _a_doctor(db, users["salma"])
    r = client.get(f"/api/ai/potential/{doctor.id}", headers=headers(users["salma"]))
    assert r.status_code == 200
    data = r.json()
    assert data["proposed_segment"] in "ABC"
    assert sum(f["points"] for f in data["factors"]) == data["score"]
    assert all(f["explanation"] for f in data["factors"])  # toujours un « pourquoi »
    assert data["next_targeting"] in {"janvier 2027", "juillet 2026", "janvier 2026", "juillet 2027"}


def test_potentiel_regles():
    """Un cabinet très fréquenté qui prescrit nos produits → A ; un petit cabinet non prescripteur → C hors cible."""
    from app.ai.potential import assess
    from app.models import DoctorProductStatus, Product

    product = Product(id=1, brand_name="Test", molecule="X", therapeutic_class="", form_dosage="",
                      target_specialties=["Cardiologue"], peak_months=[])
    big = Doctor(id=1, first_name="A", last_name="B", specialty="Cardiologue", segment="B", frequency="F1",
                 patients_per_day=40, prescriptions=[DoctorProductStatus(product_id=1, status="regulier")])
    small = Doctor(id=2, first_name="C", last_name="D", specialty="Cardiologue", segment="B", frequency="F2",
                   patients_per_day=6, prescriptions=[])
    a, c = assess(big, [product]), assess(small, [product])
    assert a.proposed_segment == "A" and a.advised_frequency in {"F1", "F2"}
    assert c.proposed_segment == "C" and c.advised_frequency is None and c.differs


def test_potentiel_a_revoir_et_validation(client, db, users):
    salma = users["salma"]
    review = client.get("/api/ai/potential/review", headers=headers(salma)).json()
    assert review and all(a["differs"] for a in review)
    first = review[0]
    before = (first["current_segment"], first["current_frequency"])
    r = client.post(f"/api/ai/potential/{first['doctor_id']}/apply", headers=headers(salma),
                    json={"segment": first["proposed_segment"], "frequency": first["advised_frequency"]})
    assert r.status_code == 200 and not r.json()["differs"]
    # On remet la fiche comme avant (la base de test est partagée)
    client.post(f"/api/ai/potential/{first['doctor_id']}/apply", headers=headers(salma),
                json={"segment": before[0], "frequency": before[1]})


def test_potentiel_droits(client, db, users):
    doctor = _a_doctor(db, users["salma"])
    assert client.get(f"/api/ai/potential/{doctor.id}", headers=headers(users["youssef"])).status_code == 403


# --- Préparer la visite --------------------------------------------------------------------

def test_preparer_la_visite(client, db, users):
    salma = users["salma"]
    visit = db.scalars(select(Visit).where(Visit.delegue_id == salma.id, Visit.reported_at.isnot(None))
                       .order_by(Visit.planned_at.desc())).first()
    r = client.get(f"/api/ai/visit-prep/{visit.doctor_id}", headers=headers(salma))
    assert r.status_code == 200
    data = r.json()
    assert data["last_report"] is not None
    assert 1 <= len(data["products"]) <= 3
    scores = [p["score"] for p in data["products"]]
    assert scores == sorted(scores, reverse=True)
    for p in data["products"]:
        assert p["factors"] and p["argument"] and p["argument_why"] and p["samples_quantity"] >= 1
    assert data["briefing"]


# --- Remplir ma semaine -----------------------------------------------------------------------

def test_remplir_ma_semaine(client, db, users):
    salma = users["salma"]
    plan = client.get("/api/ai/week-plan", headers=headers(salma)).json()
    assert plan["total_proposed"] > 20
    doctors = {d.id: d for d in db.scalars(select(Doctor).where(Doctor.delegue_id == salma.id))}
    seen = set()
    for day in plan["days"]:
        assert len(day["proposals"]) + day["already_planned"] <= max(day["capacity"], day["already_planned"])
        for p in day["proposals"]:
            d = doctors[p["doctor_id"]]
            weekday = str(__import__("datetime").date.fromisoformat(day["day"]).weekday())
            assert not d.reception_days or weekday in d.reception_days.split(",")  # jour de réception respecté
            assert p["doctor_id"] not in seen  # un médecin une seule fois dans la semaine
            seen.add(p["doctor_id"])
            assert p["reasons"]


def test_remplir_ma_semaine_validation(client, db, users):
    salma = users["salma"]
    plan = client.get("/api/ai/week-plan", headers=headers(salma)).json()
    chosen = [p for day in plan["days"] for p in day["proposals"]][:2]
    r = client.post("/api/ai/week-plan/confirm", headers=headers(salma),
                    json={"visits": [{"doctor_id": p["doctor_id"], "planned_at": p["planned_at"]} for p in chosen]})
    assert r.status_code == 200 and r.json()["planned"] == 2
    created = list(db.scalars(select(Visit).where(Visit.notes == "Planifiée avec « Remplir ma semaine »")))
    assert len(created) == 2
    for v in created:  # nettoyage
        db.delete(v)
    db.commit()


# --- Ventes, clôture, fiches médicales -------------------------------------------------------------

def test_conclusions_ventes(client, users):
    data = client.get("/api/ai/sales-insights", headers=headers(users["hamza"])).json()
    assert data["summary"]
    assert data["zones"] and all(z["why"] for z in data["zones"])
    for d in data["doctors"]:
        assert d["doctor_id"] and len(d["why"]) == 3


def test_cloturer_journee_et_mois(client, db, users):
    hamza = users["hamza"]
    last = db.scalars(select(Visit).where(Visit.delegue_id == hamza.id, Visit.reported_at.isnot(None))
                      .order_by(Visit.planned_at.desc())).first()
    day = client.get("/api/ai/closing/day", headers=headers(hamza),
                     params={"day": last.planned_at.date().isoformat()}).json()
    assert "visites réalisées" in day["report"] and day["figures"]["realisees"] >= 1
    month = client.get("/api/ai/closing/month", headers=headers(hamza)).json()
    assert "CPA" in month["report"] and "cpa_f1" in month["figures"]


def test_fiches_medicales(client, users):
    salma = users["salma"]
    r = client.post("/api/ai/assistant/ask", headers=headers(salma), json={"question": "C'est quoi la CMI ?"}).json()
    assert r["kind"] == "medical" and not r["refused"] and r["citations"]
    assert "concentration minimale inhibitrice" in r["answer"]
    r = client.post("/api/ai/assistant/ask", headers=headers(salma),
                    json={"question": "Quelle différence entre Gram positif et Gram négatif ?"}).json()
    assert r["kind"] == "medical" and "paroi" in r["answer"]
