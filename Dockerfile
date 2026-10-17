# =============================================================================
# Image de mise en ligne de NOOR Demo (utilisée par Render, ou tout hébergeur Docker)
# Une seule image = le frontend compilé + l'API FastAPI, sur une seule adresse.
#   docker build -t noor-demo .
#   docker run -p 8000:8000 noor-demo      → http://localhost:8000
# (Docker n'est PAS nécessaire pour travailler en local : voir le README.)
# =============================================================================

# --- Étape 1 : compiler le frontend React --------------------------------------
FROM node:22-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# --- Étape 2 : image finale Python ------------------------------------------------
FROM python:3.13-slim
# Heure du Maroc : « aujourd'hui », l'agenda du jour et les KPIs suivent l'heure locale.
# NOOR_DAILY_RESEED=1 : données de démo régénérées chaque nuit à 4 h (backend/app/services/daily_reseed.py).
ENV TZ=Africa/Casablanca \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000 \
    NOOR_DAILY_RESEED=1
RUN apt-get update && apt-get install -y --no-install-recommends tzdata \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./
COPY docs/ /app/docs/
COPY --from=frontend /app/frontend/dist /app/frontend/dist

EXPOSE 8000
# À chaque démarrage : base de démo régénérée (données à la date du jour), puis l'API.
CMD ["sh", "-c", "python seed.py && uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
