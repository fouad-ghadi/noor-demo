"""
Préparation commune des tests automatiques.

- Les tests utilisent leur PROPRE base SQLite (dossier temporaire), jamais backend/noor.db.
- Claude est désactivé (pas de clé) : les tests vérifient les règles, qui marchent sans internet.
- Les données de démo sont générées une seule fois (≈ 10 s) pour toute la session de tests.
"""
import os
import tempfile
from pathlib import Path

# ⚠️ Doit être fait AVANT d'importer l'application (app/database.py lit cette variable)
_TMP = Path(tempfile.mkdtemp(prefix="noor-tests-"))
os.environ["NOOR_DB_PATH"] = str(_TMP / "noor_test.db")
os.environ.pop("ANTHROPIC_API_KEY", None)

import pytest  # noqa: E402
from sqlalchemy import select  # noqa: E402

import seed  # noqa: E402
from app.database import SessionLocal  # noqa: E402
from app.models import User  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def demo_data():
    """Génère les données de démo une fois pour toute la session."""
    seed.main()
    yield


@pytest.fixture
def db():
    with SessionLocal() as session:
        yield session


@pytest.fixture
def users(db):
    """Comptes de démo par prénom : users["hamza"], users["nadia"]..."""
    return {u.email.split(".")[0]: u for u in db.scalars(select(User))}
