"""
Préparation des tests automatiques (pytest).

Les tests utilisent une base TEMPORAIRE, remplie par le seed une seule fois pour toute
la session : votre base de travail backend/noor.db n'est jamais modifiée.

Lancer les tests (PowerShell, dans le dossier backend, venv activé) :
    pip install -r requirements-dev.txt
    python -m pytest
"""
import os
import sys
import tempfile
from pathlib import Path

import pytest

# À faire AVANT d'importer l'application : la base pointe vers un fichier temporaire
_TMP = Path(tempfile.mkdtemp(prefix="noor-tests-"))
os.environ["NOOR_DB_PATH"] = str(_TMP / "noor-test.db")
os.environ.pop("ANTHROPIC_API_KEY", None)  # tests sans IA générative : résultats reproductibles
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


@pytest.fixture(scope="session")
def seeded():
    """Base de démo complète (≈ 10 s, une seule fois)."""
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
    """Comptes de démo par identifiant d'e-mail : users["salma.berrada"]..."""
    from sqlalchemy import select

    from app.models import User

    return {u.email.split("@")[0]: u for u in db.scalars(select(User))}


def headers(user) -> dict:
    return {"X-User-Id": str(user.id)}
