"""
Point d'entrée de l'API NOOR Demo.

Lancer :  uvicorn app.main:app --reload   (depuis le dossier backend/)
Doc interactive : http://localhost:8000/docs
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import alerts, doctors, meta, objectives, products, stats, users, visits
from app.database import Base, engine

# Crée les tables si elles n'existent pas encore (le seed les recrée de toute façon)
Base.metadata.create_all(bind=engine)

app = FastAPI(
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

for module in (users, meta, doctors, visits, products, objectives, alerts, stats):
    app.include_router(module.router, prefix="/api")


@app.get("/api/health", tags=["Système"])
def health():
    return {"status": "ok"}
