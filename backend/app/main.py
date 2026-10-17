"""
Point d'entrée de l'API NOOR Demo.

Lancer :  uvicorn app.main:app --reload   (depuis le dossier backend/)
Doc interactive : http://localhost:8000/docs
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import ai, alerts, doctors, meta, objectives, products, stats, users, visits
from app.database import Base, engine
from app.services import daily_reseed

# Crée les tables si elles n'existent pas encore (le seed les recrée de toute façon)
Base.metadata.create_all(bind=engine)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Au démarrage : en ligne, régénère les données de démo chaque nuit (voir daily_reseed.py)."""
    daily_reseed.start()
    yield


app = FastAPI(
    lifespan=lifespan,
    title="NOOR Demo — API",
    description="CRM pharmaceutique de démonstration pour délégués médicaux.",
    version="0.1.0",
)

# Autorise le frontend Vite (port 5173) à appeler l'API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

for module in (users, meta, doctors, visits, products, objectives, alerts, stats, ai):
    app.include_router(module.router, prefix="/api")


@app.get("/api/health", tags=["Système"])
def health():
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Mise en ligne : le backend sert aussi le frontend compilé (frontend/dist).
# En local, ce dossier n'existe pas (on utilise `npm run dev`) : ce bloc ne fait rien.
# En production (Docker / Render), une seule adresse sert l'application ET l'API.
# ---------------------------------------------------------------------------
import os  # noqa: E402
from pathlib import Path  # noqa: E402

from fastapi import HTTPException  # noqa: E402
from fastapi.responses import FileResponse  # noqa: E402

FRONTEND_DIST = Path(os.environ.get("FRONTEND_DIST", Path(__file__).resolve().parents[2] / "frontend" / "dist"))

if (FRONTEND_DIST / "index.html").is_file():

    @app.get("/{path:path}", include_in_schema=False)
    def serve_frontend(path: str):
        """Fichiers du frontend ; toute autre URL renvoie index.html (le routeur React prend le relais)."""
        if path.startswith("api/"):
            raise HTTPException(404, "Route API inconnue")
        file = (FRONTEND_DIST / path).resolve()
        if path and file.is_file() and FRONTEND_DIST.resolve() in file.parents:
            return FileResponse(file)
        return FileResponse(FRONTEND_DIST / "index.html")
