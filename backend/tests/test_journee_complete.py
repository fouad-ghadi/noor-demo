"""
Tests du prototype « journée complète » (26 nov. 2026) : itinéraire de la semaine, imprévu,
objectifs de la visite, compte-rendu structuré + vérification, clôture validée,
objectifs de ventes et zones à fort potentiel, établissement lu sur la carte, ventes dans le chatbot.
"""
from datetime import datetime, time, timedelta

from sqlalchemy import select

from app.ai.card_scanner import extract_fields
from app.models import DayClosing, Product, Visit
from app.models.enums import VisitStatus
from app.services.dates import now
from tests.conftest import headers


def _next_day_with_visits(db, user):
    """Premier jour à venir (après aujourd'hui) avec des visites planifiées."""
    v = db.scalars(select(Visit).where(Visit.delegue_id == user.id, Visit.status == VisitStatus.PLANIFIEE,
                                       Visit.planned_at >= datetime.combine(now().date() + timedelta(days=1), time(0)))
                   .order_by(Visit.planned_at)).first()
    return v.planned_at.date()


# --- Remplir ma semaine : itinéraire ------------------------------------------------------------

def test_semaine_avec_itineraire(client, users):
    plan = client.get("/api/ai/week-plan", headers=headers(users["youssef"])).json()
    days = [d for d in plan["days"] if len(d["proposals"]) > 1]
    assert days
    for d in days:
        assert d["route_km"] > 0 and d["travel_min"] > 0
        # Étape = distance depuis l'arrêt précédent (absente si un médecin n'a pas de position GPS)
        legs = [p["distance_km"] for p in d["proposals"][1:] if p["distance_km"] is not None]
        assert legs and all(x >= 0 for x in legs)
        assert abs(sum(legs) - d["route_km"]) < 0.2   # la tournée = somme des étapes


# --- Imprévu : réorganiser la journée -----------------------------------------------------------

def test_imprevu_retard_decale_puis_reporte(client, db, users):
    user = users["salma"]
    day = _next_day_with_visits(db, user)
    r = client.post("/api/ai/replan-day", headers=headers(user),
                    json={"day": day.isoformat(), "reason": "retard", "delay_min": 120, "from_time": "08:00"})
    assert r.status_code == 200
    data = r.json()
    assert data["moves"]
    for m in data["moves"]:
        assert m["why"]
        if m["kind"] == "decalee":
            assert datetime.fromisoformat(m["new_at"]) - datetime.fromisoformat(m["old_at"]) == timedelta(minutes=120)
        else:   # reportée : un autre jour, après la journée concernée
            assert datetime.fromisoformat(m["new_at"]).date() > day
    # Rien n'est modifié avant la validation
    assert db.get(Visit, data["moves"][0]["visit_id"]).planned_at.isoformat() == data["moves"][0]["old_at"]


def test_imprevu_medecin_absent_respecte_reception(client, db, users):
    user = users["hamza"]
    day = _next_day_with_visits(db, user)
    visit = db.scalars(select(Visit).where(Visit.delegue_id == user.id, Visit.status == VisitStatus.PLANIFIEE,
                                           Visit.planned_at >= datetime.combine(day, time(0)))
                       .order_by(Visit.planned_at)).first()
    r = client.post("/api/ai/replan-day", headers=headers(user),
                    json={"day": day.isoformat(), "reason": "medecin_absent", "visit_ids": [visit.id]}).json()
    assert len(r["moves"]) == 1
    new_at = datetime.fromisoformat(r["moves"][0]["new_at"])
    days = visit.doctor.reception_days
    assert not days or str(new_at.weekday()) in days.split(",")
    ok = client.post("/api/ai/replan-day/apply", headers=headers(user),
                     json={"moves": [{"visit_id": visit.id, "planned_at": r["moves"][0]["new_at"]}]})
    assert ok.status_code == 200 and ok.json()["moved"] == 1
    db.expire_all()
    assert db.get(Visit, visit.id).planned_at == new_at


def test_imprevu_refuse_un_collegue(client, db, users):
    day = _next_day_with_visits(db, users["salma"])
    visit = db.scalars(select(Visit).where(Visit.delegue_id == users["salma"].id,
                                           Visit.status == VisitStatus.PLANIFIEE,
                                           Visit.planned_at >= datetime.combine(day, time(0)))).first()
    r = client.post("/api/ai/replan-day/apply", headers=headers(users["youssef"]),
                    json={"moves": [{"visit_id": visit.id, "planned_at": f"{day.isoformat()}T18:00:00"}]})
    assert r.status_code == 403


# --- Préparer la visite : objectifs et informations essentielles ---------------------------------

def test_preparer_visite_objectifs(client, db, users):
    user = users["salma"]
    visit = db.scalars(select(Visit).where(Visit.delegue_id == user.id, Visit.reported_at.isnot(None))
                       .order_by(Visit.planned_at.desc())).first()
    data = client.get(f"/api/ai/visit-prep/{visit.doctor_id}", headers=headers(user)).json()
    assert 1 <= len(data["objectives"]) <= 5
    assert data["address"] and data["district"]
    assert data["last_visit_date"]


# --- Compte-rendu structuré + vérification -------------------------------------------------------

def _pending_visit(db, user) -> Visit:
    return db.scalars(select(Visit).where(Visit.delegue_id == user.id, Visit.status == VisitStatus.PLANIFIEE,
                                          Visit.planned_at < now()).order_by(Visit.planned_at)).first()


def test_compte_rendu_structure_et_controles(client, db, users):
    user = users["imane"]
    visit = _pending_visit(db, user)
    product = db.scalars(select(Product)).first()
    payload = {
        "duration_min": 15, "product_ids": [product.id], "feedback": "favorable",
        "objections": [{"category": "prix_eleve", "comment": None, "product_id": product.id}],
        "samples": [{"product_id": product.id, "quantity": 2, "lot_number": None}],
        "notes": f"Une patiente a fait une éruption cutanée sous {product.brand_name}.",
        "next_step": None,
    }
    r = client.post(f"/api/ai/report-structure/{visit.id}", headers=headers(user), json=payload)
    assert r.status_code == 200
    data = r.json()
    labels = [s["label"] for s in data["sections"]]
    assert labels[:3] == ["Contexte", "Produits présentés", "Réaction du médecin"]
    assert "Objections" in labels and "Échantillons remis" in labels
    checks = " ".join(c["text"] for c in data["checks"])
    assert "lot" in checks and "objection" in checks and "Pharmacovigilance" in checks
    # Rien n'est enregistré à cette étape
    db.expire_all()
    assert db.get(Visit, visit.id).status == VisitStatus.PLANIFIEE

    # Le délégué valide le texte (modifié) : il est enregistré avec la visite
    payload.update(report_summary="Texte relu et corrigé par la déléguée.", plan_next_visit=False)
    ok = client.put(f"/api/visits/{visit.id}/report", headers=headers(user), json=payload)
    assert ok.status_code == 200, ok.text
    assert ok.json()["report_summary"] == "Texte relu et corrigé par la déléguée."


# --- Clôture de la journée validée ------------------------------------------------------------------

def test_cloture_journee_validee(client, db, users):
    user = users["youssef"]
    r = client.get("/api/ai/closing/day", headers=headers(user)).json()
    assert r["day"] and r["visits"] and r["objectives"]
    assert {"label", "reached", "detail"} <= set(r["objectives"][0])
    assert r["validated_at"] is None
    saved = client.post("/api/ai/closing/day/validate", headers=headers(user),
                        json={"day": r["day"], "report": r["report"] + "\nNote ajoutée par le délégué."}).json()
    assert saved["validated_at"] and saved["validated_report"].endswith("Note ajoutée par le délégué.")
    # Revalider met à jour la même clôture (une seule par jour)
    client.post("/api/ai/closing/day/validate", headers=headers(user), json={"day": r["day"], "report": "Bilan final du jour."})
    rows = list(db.scalars(select(DayClosing).where(DayClosing.delegue_id == user.id)))
    assert len(rows) == 1 and rows[0].report == "Bilan final du jour."


def test_cloture_refuse_le_futur(client, users):
    future = (now().date() + timedelta(days=3)).isoformat()
    r = client.post("/api/ai/closing/day/validate", headers=headers(users["youssef"]),
                    json={"day": future, "report": "Journée pas encore faite."})
    assert r.status_code == 400


# --- Objectifs de ventes et zones à fort potentiel ----------------------------------------------------

def test_objectifs_de_ventes(client, users):
    data = client.get("/api/sales/scorecard", headers=headers(users["salma"])).json()
    assert len(data["products"]) == 10 and "fictifs" in data["objective_rule"]
    rates = [p["attainment_pct"] for p in data["products"]]
    assert rates == sorted(rates)                     # produits en retard d'abord
    for p in data["products"]:
        assert abs(p["value"] / p["objective"] * 100 - p["attainment_pct"]) < 0.2
        assert len(p["pm_series"]) == 12 and p["why"]
    assert data["territories"] and all(t["why"] for t in data["territories"])


# --- Carte de visite : établissement --------------------------------------------------------------------

def test_carte_etablissement():
    fields, _ = extract_fields("Dr Leïla BENNIS\nPédiatre\nClinique Les Orangers\nRésidence Anfa Place, Bd d'Anfa\n"
                               "Anfa - Casablanca\nTél : 05 22 39 40 41")
    assert fields.establishment == "Clinique Les Orangers"
    assert fields.practice_type == "clinique"
    assert fields.address.startswith("Résidence Anfa Place")


# --- Chatbot : mes ventes ---------------------------------------------------------------------------------

def test_chatbot_mes_ventes(client, users):
    r = client.post("/api/ai/assistant/ask", headers=headers(users["salma"]),
                    json={"question": "Quelles sont mes ventes d'Amoxira ?"}).json()
    assert r["kind"] == "donnees" and not r["refused"]
    assert "Amoxira" in r["answer"] and "fictives" in r["answer"]
    assert r["citations"][0]["link"].startswith("/ventes")
