"""
Préparation commune des tests automatiques (pytest).

- Les tests utilisent leur PROPRE base SQLite (dossier temporaire), jamais backend/noor.db.
- Claude est désactivé (pas de clé) : les tests vérifient les règles, qui marchent sans internet.
- Les données de démo sont générées une seule fois (≈ 10 s) pour toute la session de tests.
- Le dossier tests/pharmacovigilance/ a son propre conftest (petite base en mémoire).

Lancer les tests (PowerShell, dans le dossier backend, venv activé) :
    pip install -r requirements-dev.txt
    python -m pytest
"""
import os
import sys
import tempfile
from pathlib import Path

# ⚠️ Doit être fait AVANT d'importer l'application (app/database.py lit cette variable)
_TMP = Path(tempfile.mkdtemp(prefix="noor-tests-"))
os.environ["NOOR_DB_PATH"] = str(_TMP / "noor-test.db")
os.environ.pop("ANTHROPIC_API_KEY", None)  # tests sans IA générative : résultats reproductibles
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest  # noqa: E402


@pytest.fixture(scope="session")
def seeded():
    """Base de démo complète (≈ 10 s, une seule fois pour toute la session)."""
    import seed

    seed.main()
    return True


@pytest.fixture
def db(seeded):
    from app.database import SessionLocal

    session = SessionLocal()
    yield session
    session.rollback()
    session.close()


@pytest.fixture(scope="session")
def client(seeded):
    from fastapi.testclient import TestClient

    from app.main import app

    return TestClient(app)


@pytest.fixture
def users(db):
    """
    Comptes de démo, accessibles de deux façons :
    par identifiant d'e-mail (users["salma.berrada"]) ou par prénom (users["salma"]).
    """
    from sqlalchemy import select

    from app.models import User

    result = {}
    for u in db.scalars(select(User)):
        login = u.email.split("@")[0]
        result[login] = u
        result[login.split(".")[0]] = u
    return result


def headers(user) -> dict:
    """En-tête d'identification de la démo."""
    return {"X-User-Id": str(user.id)}
