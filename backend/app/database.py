"""
Connexion à la base de données SQLite.

Toute la base tient dans un seul fichier : backend/noor.db
Pour la remettre à zéro : `python seed.py`.
"""
import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

# Le fichier noor.db est placé dans le dossier backend/
# (les tests automatiques utilisent une base temporaire via la variable NOOR_DB_PATH)
DB_PATH = Path(os.environ.get("NOOR_DB_PATH") or Path(__file__).resolve().parent.parent / "noor.db")
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


# Colonnes ajoutées après la création de certaines bases locales : (table, colonne, type SQL)
NEW_COLUMNS = [
    ("visits", "report_summary", "TEXT"),
    ("doctors", "establishment", "VARCHAR(120)"),
]


def add_missing_columns(bind) -> None:
    """
    Petite « migration » : ajoute les colonnes récentes à une base existante.
    Ainsi, une base créée avant la mise à jour continue de marcher sans relancer `python seed.py`.
    """
    from sqlalchemy import inspect, text

    inspector = inspect(bind)
    tables = set(inspector.get_table_names())
    with bind.begin() as conn:
        for table, column, sql_type in NEW_COLUMNS:
            if table in tables and column not in {c["name"] for c in inspector.get_columns(table)}:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {sql_type}"))
