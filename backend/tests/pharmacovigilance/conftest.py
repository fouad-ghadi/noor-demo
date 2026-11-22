"""
Préparation des tests de pharmacovigilance : une petite base SQLite EN MÉMOIRE (la vraie
base noor.db n'est jamais touchée), avec 1 superviseur, 2 délégués, 1 médecin, 2 produits.
Les fixtures « db » et « client » ci-dessous remplacent, pour ce dossier seulement, celles de
tests/conftest.py (base de démo complète).

Lancer les tests (depuis le dossier backend/) :
    python -m pytest
"""
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models import Doctor, Product, User, Visit
from app.services.dates import now


@pytest.fixture
def db():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()
    yield session
    session.close()


@pytest.fixture
def data(db):
    """Jeu de données minimal. Renvoie un dictionnaire d'objets utiles aux tests."""
    chef = User(name="Nadia Test", email="chef@test.ma", role="superviseur", region="Casablanca")
    db.add(chef)
    db.flush()
    youssef = User(name="Youssef Test", email="youssef@test.ma", role="delegue", region="Casablanca",
                   phone="06 00 00 00 01", supervisor_id=chef.id)
    salma = User(name="Salma Test", email="salma@test.ma", role="delegue", region="Rabat",
                 supervisor_id=chef.id)
    db.add_all([youssef, salma])
    db.flush()
    calmapyr = Product(brand_name="Calmapyr", molecule="Paracétamol", therapeutic_class="Antalgique",
                       form_dosage="Comprimés 1 g")
    amoxira = Product(brand_name="Amoxira", molecule="Amoxicilline", therapeutic_class="Antibiotique",
                      form_dosage="Gélules 500 mg")
    db.add_all([calmapyr, amoxira])
    db.flush()
    doctor = Doctor(first_name="Karim", last_name="Bennani", specialty="Généraliste", practice_type="cabinet",
                    address="12 rue Test", city="Casablanca", district="Maarif", segment="A",
                    phone="05 22 00 00 00", delegue_id=youssef.id)
    db.add(doctor)
    db.flush()
    visit = Visit(delegue_id=youssef.id, doctor_id=doctor.id, status="planifiee",
                  planned_at=now() - timedelta(hours=2))
    db.add(visit)
    db.commit()
    return {"chef": chef, "youssef": youssef, "salma": salma, "doctor": doctor,
            "calmapyr": calmapyr, "amoxira": amoxira, "visit": visit}


@pytest.fixture
def client(db):
    """Client HTTP de test branché sur la base en mémoire."""
    app.dependency_overrides[get_db] = lambda: db
    yield TestClient(app)
    app.dependency_overrides.clear()


def as_user(user: User) -> dict:
    """En-tête d'identification de la démo."""
    return {"X-User-Id": str(user.id)}


def report(notes: str, product_ids: list[int], actual_at: datetime | None = None) -> dict:
    """Corps d'un compte-rendu de visite minimal."""
    return {
        "duration_min": 15,
        "product_ids": product_ids,
        "feedback": "favorable",
        "notes": notes,
        "plan_next_visit": False,
        **({"actual_at": actual_at.isoformat()} if actual_at else {}),
    }
