"""
Tests de l'assistant NOOR étendu : mode d'emploi du CRM et questions sur « mes chiffres ».

Lancer (dans le dossier backend) :   python -m pytest
"""
from datetime import timedelta
from types import SimpleNamespace

import anthropic
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.ai import crm_data, crm_guide, llm, rag_assistant
from app.ai.schemas import AskRequest
from app.main import app
from app.models import Doctor
from app.models.enums import VISITS_PER_MONTH, Frequency
from app.services import activity_service
from app.services.dates import now, period_of


def ask(db, user, question):
    return rag_assistant.answer(db, user, AskRequest(question=question))


# ---------------------------------------------------------------------------
# 1. Aiguillage : chaque question va vers la bonne source
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("question, kind", [
    ("Quel est mon CPA ?", "donnees"),
    ("Quels médecins F2 n'ai-je pas encore vus ?", "donnees"),
    ("Ma tournée de demain ?", "donnees"),
    ("Où en sont mes objectifs ?", "donnees"),
    ("J'ai des comptes-rendus en retard ?", "donnees"),
    ("Comment planifier une visite ?", "guide"),
    ("Comment est calculé le CPA ?", "guide"),
    ("Comment ajouter un congé ?", "guide"),
    ("Où voir mes ventes ?", "guide"),
    ("C'est quoi un médecin F2 ?", "guide"),
    ("Peut-on donner Amoxira à un enfant de moins de 6 ans ?", "produit"),
    ("Effets indésirables de Glucanor ?", "produit"),
])
def test_aiguillage(db, users, question, kind):
    response = ask(db, users["hamza"], question)
    assert response.kind == kind
    assert not response.refused
    assert response.citations, "chaque réponse doit citer sa source"


@pytest.mark.parametrize("question", ["Quel est le prix de Cardiovex ?", "Quelle est la capitale de la France ?"])
def test_refus_hors_documents(db, users, question):
    response = ask(db, users["hamza"], question)
    assert response.refused
    assert response.citations == []


# ---------------------------------------------------------------------------
# 2. Mes chiffres : les réponses reprennent EXACTEMENT les calculs de l'application
# ---------------------------------------------------------------------------

def test_mon_cpa_identique_a_la_page_statistiques(db, users):
    hamza = users["hamza"]
    row = activity_service.delegue_activity(db, hamza)  # même calcul que la page Statistiques
    response = ask(db, hamza, "Quel est mon CPA ?")
    assert response.answer.startswith("Votre CPA est de " + crm_data.fmt_pct(row.cpa_pct))
    assert f"{row.f1_ok} médecins F1 sur {row.targeted_f1}" in response.answer
    assert f"{row.f2_ok} médecins F2 sur {row.targeted_f2}" in response.answer
    assert response.citations[0].link == "/statistiques"


def test_indicateur_demande_en_premier(db, users):
    response = ask(db, users["salma"], "Quelle est ma moyenne de visites par jour ?")
    assert response.answer.startswith("Votre moyenne de visites par jour est de")


def test_cpa_du_mois_precedent(db, users):
    response = ask(db, users["hamza"], "Mon CPA le mois dernier ?")
    previous = activity_service.available_periods()[1]
    row = activity_service.delegue_activity(db, users["hamza"], previous)
    assert crm_data.fmt_pct(row.cpa_pct) in response.answer
    assert "à date du" not in response.answer  # mois terminé : pas d'indicateur « à date »


def test_medecins_f2_a_voir_sont_vraiment_en_retard(db, users):
    hamza = users["hamza"]
    result = crm_data.medecins_a_voir(db, hamza, frequence="F2")
    first, last = activity_service.period_range(period_of(now().date()))
    _, visits = activity_service._raw_counts(db, [hamza.id], first, last)
    # Recompte indépendant : médecins F2 de Hamza avec moins de 2 visites ce mois-ci
    f2 = db.scalars(select(Doctor.id).where(Doctor.delegue_id == hamza.id, Doctor.frequency == Frequency.F2)).all()
    expected = [d for d in f2 if visits[d] < VISITS_PER_MONTH[Frequency.F2]]
    assert result.data["nombre"] == len(expected)
    for doctor in result.data["medecins"]:
        assert doctor["frequence"] == "F2"
        assert doctor["visites_ce_mois"] < 2
        assert doctor["delegue"] == hamza.name


def test_tournee_de_demain(db, users):
    result = crm_data.visites_du_jour(db, users["salma"], jour="demain")
    tomorrow = now().date() + timedelta(days=1)
    assert result.data["jour"] == tomorrow.isoformat()
    assert result.citation.link == f"/planning?vue=jour&date={tomorrow.isoformat()}"
    heures = [v["heure"] for v in result.data["visites"]]
    assert heures == sorted(heures)  # dans l'ordre de passage


@pytest.mark.parametrize("text, delta", [("aujourd'hui", 0), ("demain", 1), ("après-demain", 2)])
def test_lecture_des_jours(text, delta):
    assert crm_data.parse_day(text) == now().date() + timedelta(days=delta)


def test_lecture_jour_de_la_semaine():
    day = crm_data.parse_day("ma tournée de mardi")
    assert day.weekday() == 1 and 0 <= (day - now().date()).days < 7


def test_objectifs_du_mois(db, users):
    response = ask(db, users["youssef"], "Où en sont mes objectifs ?")
    assert response.answer.startswith("Vous avez réalisé")
    assert response.citations[0].link == "/objectifs"


# ---------------------------------------------------------------------------
# 3. Droits d'accès : un délégué ne voit que ses données
# ---------------------------------------------------------------------------

def test_delegue_ne_voit_pas_le_cpa_d_un_collegue(db, users):
    response = ask(db, users["hamza"], "Quel est le CPA de Salma ?")
    assert response.refused
    assert "%" not in response.answer  # aucun chiffre du collègue n'est divulgué


def test_superviseur_voit_son_equipe(db, users):
    response = ask(db, users["nadia"], "Quel est mon CPA ?")
    assert response.answer.startswith("Le CPA de l'équipe")
    for name in ("Hamza", "Salma", "Youssef", "Imane"):
        assert name in response.answer


def test_superviseur_voit_un_delegue_nomme(db, users):
    row = activity_service.delegue_activity(db, users["imane"])
    response = ask(db, users["nadia"], "Quelle est la couverture d'Imane ?")
    assert response.answer.startswith("La couverture de la cible d'Imane")
    assert crm_data.fmt_pct(row.coverage_pct) in response.answer


# ---------------------------------------------------------------------------
# 4. Mode d'emploi : le guide est bien découpé et les bonnes sections sont citées
# ---------------------------------------------------------------------------

def test_guide_decoupe_en_sections():
    passages = crm_guide.load_passages()
    assert [p.section_no for p in passages] == list(range(1, len(passages) + 1))
    assert len(passages) >= 15


@pytest.mark.parametrize("question, section", [
    ("Comment planifier une visite ?", "Planifier une visite"),
    ("Comment annuler une visite ?", "Déplacer, reporter ou annuler une visite"),
    ("Comment dicter un compte-rendu en darija ?", "Dicter un compte-rendu"),
    ("Comment est calculé le CPA ?", "Comprendre les statistiques"),
    ("Comment ajouter un nouveau médecin ?", "Ajouter ou modifier un médecin"),
    ("Comment signaler un effet indésirable ?", "Signaler un effet indésirable"),
    ("Que veut dire DSM ?", "Vocabulaire"),
])
def test_guide_cite_la_bonne_section(db, users, question, section):
    response = ask(db, users["hamza"], question)
    assert response.kind == "guide"
    assert response.citations[0].section.startswith(section)
    assert response.citations[0].document_title == crm_guide.GUIDE_TITLE


# ---------------------------------------------------------------------------
# 5. Avec Claude : il passe par les outils (simulé, sans appel réseau)
# ---------------------------------------------------------------------------

class FakeClaude:
    """Remplace le client Anthropic : rejoue des réponses écrites à l'avance."""
    script: list = []
    calls: list = []

    def __init__(self, *args, **kwargs):
        self.beta = SimpleNamespace(messages=SimpleNamespace(create=self._create))

    def _create(self, **kwargs):
        FakeClaude.calls.append(kwargs)
        return FakeClaude.script.pop(0)


def _tool_use(name, args):
    block = SimpleNamespace(type="tool_use", id="toolu_1", name=name, input=args)
    return SimpleNamespace(stop_reason="tool_use", content=[block])


def _text(text):
    return SimpleNamespace(stop_reason="end_turn", content=[SimpleNamespace(type="text", text=text)])


@pytest.fixture
def fake_claude(monkeypatch):
    monkeypatch.setattr(llm, "is_available", lambda: True)
    monkeypatch.setattr(anthropic, "Anthropic", FakeClaude)
    FakeClaude.calls = []
    return FakeClaude


def test_claude_appelle_un_outil_puis_repond(db, users, fake_claude):
    fake_claude.script = [_tool_use("indicateurs_activite", {"mois": "courant", "delegue": ""}),
                          _text("Votre CPA est de 42,5 %.")]
    response = ask(db, users["hamza"], "Quel est mon CPA ?")
    assert response.answer == "Votre CPA est de 42,5 %."
    assert response.kind == "donnees"
    assert response.citations[0].link == "/statistiques"
    # Les outils sont décrits à Claude, et le résultat de l'outil lui est renvoyé
    assert {t["name"] for t in fake_claude.calls[0]["tools"]} == set(crm_data.TOOLS)
    tool_result = fake_claude.calls[1]["messages"][-1]["content"][0]
    assert tool_result["type"] == "tool_result" and '"cpa_pct"' in tool_result["content"]


def test_claude_respecte_les_droits_d_acces(db, users, fake_claude):
    fake_claude.script = [_tool_use("indicateurs_activite", {"mois": "courant", "delegue": "Salma"}),
                          _text("Je ne peux pas vous donner le CPA de Salma.")]
    response = ask(db, users["hamza"], "Quel est le CPA de Salma ?")
    tool_result = fake_claude.calls[1]["messages"][-1]["content"][0]["content"]
    assert "erreur" in tool_result and "cpa_pct" not in tool_result
    # Aucun outil n'a abouti : NOOR répond avec ses règles (refus), jamais avec un chiffre inventé
    assert response.refused


def test_sans_appel_d_outil_on_revient_aux_regles(db, users, fake_claude):
    fake_claude.script = [_text("Votre CPA est sûrement de 90 %.")]  # réponse « devinée » : refusée
    response = ask(db, users["hamza"], "Quel est mon CPA ?")
    row = activity_service.delegue_activity(db, users["hamza"])
    assert "90 %" not in response.answer
    assert crm_data.fmt_pct(row.cpa_pct) in response.answer


# ---------------------------------------------------------------------------
# 6. Route HTTP utilisée par le panneau « Assistant NOOR »
# ---------------------------------------------------------------------------

def test_route_api(users):
    client = TestClient(app)
    r = client.post("/api/ai/assistant/ask", json={"question": "Quel est mon CPA ?"},
                    headers={"X-User-Id": str(users["salma"].id)})
    assert r.status_code == 200
    body = r.json()
    assert body["kind"] == "donnees" and body["citations"][0]["link"] == "/statistiques"
