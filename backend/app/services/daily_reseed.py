"""
Régénération quotidienne des données de démo (mise en ligne uniquement).

Pourquoi ? Les données de démo sont calculées par rapport à la date du jour
(agenda du jour, 2 semaines de planning, mois en cours). En ligne, le seed est lancé
au démarrage du service. Si le service ne redémarre jamais (par exemple parce qu'un
service de surveillance le visite toutes les 5 minutes pour l'empêcher de « dormir »),
l'agenda du jour deviendrait vite périmé.

Solution : chaque nuit (4 h du matin, heure du serveur = Africa/Casablanca), on relance
`python seed.py` dans un processus séparé. Un processus séparé est plus simple et plus sûr
que de réimporter le seed : celui-ci calcule « aujourd'hui » une seule fois, au chargement.

Activé seulement si la variable d'environnement NOOR_DAILY_RESEED vaut "1"
(c'est le cas dans le Dockerfile). En local, rien ne change : on lance le seed soi-même.
"""
import logging
import os
import subprocess
import sys
import threading
import time
from datetime import datetime, timedelta
from pathlib import Path

# Logger d'uvicorn : ses messages apparaissent dans les journaux (« Logs ») de Render
log = logging.getLogger("uvicorn.error")

# Dossier backend/ (là où se trouve seed.py)
BACKEND_DIR = Path(__file__).resolve().parents[2]
RESEED_HOUR = 4  # 4 h du matin : personne ne fait de démo à cette heure-là


def is_enabled() -> bool:
    return os.environ.get("NOOR_DAILY_RESEED") == "1"


def seconds_until_next_run(now: datetime, hour: int = RESEED_HOUR) -> float:
    """Nombre de secondes jusqu'au prochain passage à `hour` h (aujourd'hui ou demain)."""
    next_run = now.replace(hour=hour, minute=0, second=0, microsecond=0)
    if next_run <= now:
        next_run += timedelta(days=1)
    return (next_run - now).total_seconds()


def run_seed() -> bool:
    """Lance `python seed.py` et attend la fin. Renvoie True si tout s'est bien passé."""
    result = subprocess.run(
        [sys.executable, "seed.py"], cwd=BACKEND_DIR, capture_output=True, text=True, timeout=600
    )
    if result.returncode == 0:
        log.info("Données de démo régénérées pour le %s", datetime.now().strftime("%d/%m/%Y"))
        return True
    log.error("Échec de la régénération des données :\n%s", result.stderr[-2000:])
    return False


def _loop() -> None:
    while True:
        time.sleep(seconds_until_next_run(datetime.now()))
        try:
            run_seed()
        except Exception:  # on ne veut jamais arrêter la boucle
            log.exception("Erreur pendant la régénération des données")


def start() -> None:
    """Démarre la régénération nocturne en arrière-plan (si elle est activée)."""
    if not is_enabled():
        return
    threading.Thread(target=_loop, name="noor-daily-reseed", daemon=True).start()
    log.info("Régénération quotidienne des données activée (chaque jour à %d h)", RESEED_HOUR)
