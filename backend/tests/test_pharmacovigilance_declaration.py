"""
Parcours complet : compte-rendu → cas + alerte → 4 informations minimales → délai de 24 h
→ déclaration pré-remplie → « Marquer comme déclarée ». Avec les droits d'accès.
"""
from datetime import timedelta

from app.models import Alert, PharmacovigilanceCase
from app.services import pharmacovigilance_service as pv
from app.services.dates import now
from tests.conftest import as_user, report

SURDOSAGE = "Le docteur signale qu'un patient a pris 12 comprimés de Calmapyr 1 g en une journée, vu aux urgences."


def _submit(client, data, notes=SURDOSAGE, actual_at=None):
    r = client.put(f"/api/visits/{data['visit'].id}/report", headers=as_user(data["youssef"]),
                   json=report(notes, [data["calmapyr"].id], actual_at))
    assert r.status_code == 200, r.text
    r = client.get("/api/pharmacovigilance/cases", headers=as_user(data["youssef"]))
    assert r.status_code == 200
    return r.json()


def test_compte_rendu_cree_un_cas_et_une_alerte(client, data, db):
    [case] = _submit(client, data)
    assert case["kind"] == "situation_particuliere"
    assert case["situations"] == ["surdosage"]
    assert case["seriousness"] == "grave"
    assert case["status"] == "a_declarer"
    # Délai : 24 h après la visite
    assert case["deadline"]["state"] in ("a_temps", "urgent")
    visit_time = data["visit"].actual_at
    assert db.get(PharmacovigilanceCase, case["id"]).deadline_at == visit_time + timedelta(hours=24)
    alert = db.get(Alert, case["alert_id"])
    assert alert.type == "pharmacovigilance" and alert.status == "nouvelle"
    assert "Situation particulière à déclarer : surdosage sous Calmapyr" == alert.title


def test_quatre_informations_minimales(client, data):
    [case] = _submit(client, data)
    infos = {i["key"]: i for i in case["minimum_info"]}
    assert list(infos) == ["produit", "evenement", "patient", "notificateur"]
    assert infos["produit"]["found"] and infos["produit"]["value"] == "Calmapyr (Paracétamol)"
    assert infos["evenement"]["found"]
    assert not infos["patient"]["found"] and infos["patient"]["hint"]   # « un patient » : à compléter
    assert infos["notificateur"]["found"] and "Dr Karim Bennani" in infos["notificateur"]["value"]
    assert case["complete"] is False
    assert case["declarable"] is True   # produit + situation suffisent pour déclarer
    assert "À COMPLÉTER" in case["declaration"]["body"]


def test_alerte_dans_le_tableau_de_bord_avec_le_delai(client, data):
    _submit(client, data)
    alerts = client.get("/api/alerts", headers=as_user(data["youssef"])).json()
    pv_alert = next(a for a in alerts if a["type"] == "pharmacovigilance")
    assert alerts[0] == pv_alert  # en tête de liste
    assert pv_alert["pv_case"]["missing"] == ["Patient identifiable"]
    assert pv_alert["pv_case"]["deadline"]["minutes_left"] > 0


def test_etats_du_delai_de_24_h(client, data, db):
    [c] = _submit(client, data)
    case = db.get(PharmacovigilanceCase, c["id"])
    assert pv.deadline_state(case, case.known_at + timedelta(hours=1)).state == "a_temps"
    assert pv.deadline_state(case, case.known_at + timedelta(hours=20)).state == "urgent"
    late = pv.deadline_state(case, case.known_at + timedelta(hours=25))
    assert late.state == "en_retard" and late.minutes_left == -60


def test_visite_ancienne_deja_en_retard(client, data):
    [case] = _submit(client, data, actual_at=now() - timedelta(days=2))
    assert case["deadline"]["state"] == "en_retard"


def test_alerte_non_fermable_sans_declaration(client, data):
    [case] = _submit(client, data)
    r = client.patch(f"/api/alerts/{case['alert_id']}", headers=as_user(data["youssef"]),
                     json={"status": "traitee"})
    assert r.status_code == 400


def test_apercu_puis_declaration(client, data, db):
    [case] = _submit(client, data)
    url = f"/api/pharmacovigilance/cases/{case['id']}"
    body = {"patient_details": "homme, 45 ans", "additional_info": "Hépatique normal au bilan."}

    preview = client.post(f"{url}/preview", headers=as_user(data["youssef"]), json=body).json()
    assert "3. Patient : homme, 45 ans" in preview["body"]
    assert "Hépatique normal au bilan." in preview["body"]
    assert preview["to"] == "pharmacovigilance@noor-demo.ma"
    assert db.get(PharmacovigilanceCase, case["id"]).status == "a_declarer"  # l'aperçu ne change rien

    r = client.post(f"{url}/declare", headers=as_user(data["youssef"]), json=body)
    assert r.status_code == 200, r.text
    declared = r.json()
    assert declared["status"] == "declaree"
    assert declared["complete"] is True
    assert declared["deadline"]["state"] == "declaree_a_temps"
    assert declared["declared_by_name"] == "Youssef Test"
    assert "homme, 45 ans" in declared["declaration"]["body"]
    assert db.get(Alert, case["alert_id"]).status == "traitee"

    # Une seule déclaration par cas
    assert client.post(f"{url}/declare", headers=as_user(data["youssef"]), json=body).status_code == 400


def test_droits_d_acces(client, data):
    [case] = _submit(client, data)
    url = f"/api/pharmacovigilance/cases/{case['id']}"
    # Un autre délégué ne voit pas le cas
    assert client.get(url, headers=as_user(data["salma"])).status_code == 403
    assert client.get("/api/pharmacovigilance/cases", headers=as_user(data["salma"])).json() == []
    # Le superviseur le voit, mais ne déclare pas à la place du délégué
    assert client.get(url, headers=as_user(data["chef"])).status_code == 200
    assert client.post(f"{url}/declare", headers=as_user(data["chef"]), json={}).status_code == 403


def test_compte_rendu_sans_effet_ne_cree_rien(client, data):
    cases = _submit(client, data, notes="Médecin très réceptif, a demandé la documentation sur Calmapyr.")
    assert cases == []
