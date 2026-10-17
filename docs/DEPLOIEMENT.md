# Mettre NOOR Demo en ligne

Deux façons de montrer l'application aux autres membres de l'équipe (ou au jury) :

| | A. Render (recommandé) | B. Lien temporaire depuis votre PC |
|---|---|---|
| Adresse | fixe, ex. `https://noor-demo.onrender.com` | change à chaque fois, ex. `https://xxx.trycloudflare.com` |
| Disponible | 24 h/24 (veille après 15 min sans visite, réveil ≈ 1 min) | seulement quand votre PC et l'application tournent |
| Mise à jour | automatique à chaque `git push` | instantanée (c'est votre version locale) |
| Coût | gratuit | gratuit |
| Mise en place | 5 minutes, une seule fois | 1 commande |

---

## A. Render (adresse fixe, mise à jour automatique)

Le dépôt contient déjà tout le nécessaire :
- `Dockerfile` : compile le frontend et lance l'API, qui sert aussi l'application (une seule adresse) ;
- `render.yaml` : la configuration du service (offre gratuite, région Francfort, déploiement automatique).

### Mise en place (une seule fois, par le propriétaire du dépôt)

1. Créer un compte sur **https://render.com** avec **« Sign in with GitHub »**.
2. Tableau de bord → **New +** → **Blueprint**.
3. Autoriser Render à accéder au dépôt **`noor-demo`** (si le dépôt est privé : « Configure GitHub App » → cocher le dépôt).
4. Choisir le dépôt `noor-demo` → Render lit `render.yaml` → **Apply** / **Deploy Blueprint**.
5. Attendre la fin du premier déploiement (5 à 10 minutes ; suivre les « Logs »).
6. L'adresse s'affiche en haut de la page du service, ex. `https://noor-demo.onrender.com`.
   La partager à l'équipe (+ `/docs` pour la documentation de l'API).

### Ensuite

- **Chaque `git push` sur `main` redéploie le site automatiquement** (2 à 5 minutes).
- Sur l'offre gratuite, le site « dort » après 15 min sans visite ; la visite suivante prend alors
  30 à 60 secondes. Pour l'éviter : voir **« Empêcher la mise en veille »** ci-dessous.

### Empêcher la mise en veille (gratuit, 5 minutes, une seule fois)

Un service de surveillance gratuit visite le site toutes les 5 minutes : il ne s'endort plus et
s'ouvre toujours instantanément. L'offre gratuite de Render (750 h par mois) suffit pour un
service allumé tout le mois (744 h au maximum).

1. Créer un compte gratuit sur **https://uptimerobot.com** (aucune carte bancaire).
2. **+ New monitor** (ou « Add New Monitor ») :
   - **Monitor type** : `HTTP(s)` ;
   - **URL** : `https://noor-demo.onrender.com/api/health`
     (une page très légère prévue pour ça : elle répond `{"status": "ok"}`) ;
   - **Monitoring interval** : `5 minutes` ;
   - **Create monitor**.
3. C'est tout. Bonus : UptimeRobot envoie un email si le site tombe en panne.

**Et l'agenda du jour ?** Le site ne redémarrant plus, les données ne seraient plus régénérées
au démarrage. Le serveur les régénère donc lui-même **chaque nuit à 4 h** (heure du Maroc) :
le matin, l'agenda du jour et le planning sont à jour. Code : `backend/app/services/daily_reseed.py`,
activé par `NOOR_DAILY_RESEED=1` dans le `Dockerfile`.

### À savoir

- **Données partagées et réinitialisées** : tout le monde utilise la même base de démo. Elle est
  régénérée (`python seed.py`) à chaque démarrage du service (redéploiement, réveil après la veille)
  et chaque nuit à 4 h.
  Les visites ajoutées en ligne ne sont donc pas conservées — c'est voulu pour une démo
  (les données restent toujours propres et à la date du jour).
- **Pas de vraie sécurité** (connexion simulée) : l'adresse est publique, ne mettez **aucune donnée réelle**.
- Heure du serveur : fuseau `Africa/Casablanca` (défini dans le `Dockerfile`).
- Plus tard, pour les modules d'IA lourds (Whisper...), l'offre gratuite (512 Mo de RAM) sera
  insuffisante : passer à une offre payante ou héberger les modèles ailleurs.

### Tester l'image Docker en local (facultatif)

```bash
docker build -t noor-demo .
docker run -p 8000:8000 noor-demo     # → http://localhost:8000
```

---

## B. Lien temporaire depuis votre PC (Cloudflare Tunnel)

Pratique pour montrer **tout de suite** ce que vous êtes en train de faire, sans rien déployer.

1. Installer `cloudflared` (une fois) :
   - Windows : `winget install --id Cloudflare.cloudflared`
   - macOS : `brew install cloudflared`
2. Lancer l'application comme d'habitude (backend + `npm run dev`).
3. Dans un **troisième** terminal :
   ```bash
   cloudflared tunnel --url http://localhost:5173
   ```
4. Copier l'adresse affichée (`https://....trycloudflare.com`) et l'envoyer à l'équipe.
   Elle fonctionne tant que les 3 terminaux restent ouverts ; Ctrl+C pour arrêter.

> Le frontend accepte déjà les adresses `*.trycloudflare.com` et `*.ngrok-free.app`
> (`server.allowedHosts` dans `frontend/vite.config.ts`).
