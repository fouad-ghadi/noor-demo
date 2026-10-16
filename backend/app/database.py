"""
Connexion à la base de données SQLite.

Toute la base tient dans un seul fichier : backend/noor.db
Pour la remettre à zéro : `python seed.py`.
"""
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

# Le fichier noor.db est placé dans le dossier backend/
DB_PATH = Path(__file__).resolve().parent.parent / "noor.db"
DATABASE_URL = f"sqlite:///{DB_PATH}"

# check_same_thread=False : nécessaire car FastAPI peut utiliser la session
# depuis plusieurs threads (sans danger ici, une session par requête).
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    """Classe mère de tous les modèles SQLAlchemy."""


def get_db():
    """Dépendance FastAPI : ouvre une session par requête puis la ferme."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
