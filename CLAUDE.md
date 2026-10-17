# CLAUDE.md — contexte du projet NOOR Demo

Ce fichier est lu automatiquement au début de chaque session Claude Code.
Il résume le projet, les conventions et l'état d'avancement.

## Le projet

Réplique de démonstration d'un CRM pharmaceutique (« NOOR ») pour les **délégués médicaux**
d'un laboratoire marocain. Projet d'innovation de 5 étudiants de l'École Centrale Casablanca.
Objectif : une base réaliste sur laquelle brancher ensuite des **fonctionnalités d'IA**
(compte-rendu dicté en darija/français, assistant produit RAG avec citations, pharmacovigilance,
scan de cartes de visite + doublons, recommandations de visites).

- Propriétaire : Fouad (GitHub `fouad-ghadi`), travaille sous **Windows / PowerShell**,
  débutant en outillage (git, venv, npm) : donner des commandes PowerShell exactes, pas à pas.
- Le jury doit pouvoir comprendre le code : **code lisible, commentaires en français**.

## Démarrage

```
backend/   python seed.py ; uvicorn app.main:app --reload     → http://localhost:8000/docs
frontend/  npm install ; npm run dev                           → http://localhost:5173
```
Python **3.11–3.13** (pas 3.14+/3.15 : paquets non disponibles sous Windows). Node 20+.
Comptes : nadia.tazi@ (superviseur), youssef.elidrissi@ (en avance), salma.berrada@ (dans les temps),
hamza.aitlahcen@ (en retard), imane.fassifihri@ (en retard, annulations) — `@noor-demo.ma`, mot de passe `demo`.

## Architecture et conventions

- **Backend** FastAPI + SQLAlchemy 2 + SQLite (`backend/noor.db`, non versionnée).
  - `app/models/` tables · `app/schemas/` Pydantic · `app/api/` routes FINES · **`app/services/` toute la logique métier**.
  - Droits : `services/access.py` (un délégué ne voit que ses données ; superviseur = son équipe).
    Utilisateur courant = en-tête `X-User-Id` (démo, pas de vraie sécurité).
  - Valeurs codées sans accents en base (`realisee`, `apres_midi`...) ; libellés côté frontend (`src/lib/labels.ts`).
  - Les alertes « métier » sont recalculées par `alert_service.refresh_alerts` (après chaque modification de visite
    et à l'ouverture du tableau de bord).
- **Frontend** React 19 + Vite + TypeScript + Tailwind v4 + composants shadcn/ui écrits à la main
  (`src/components/ui/`, `components.json` présent), React Query, React Router, Recharts, Leaflet.
  - **Interface 100 % en français**, dates « 16 oct. 2026 » via `src/lib/format.ts` (date-fns/fr).
  - Mobile d'abord pour les vues délégué (barre de navigation en bas), superviseur orienté ordinateur.
  - Après toute modification de visite : `invalidateVisitData(queryClient)` (`src/hooks/queries.ts`) → KPIs à jour.
  - Chaque page déclare son contexte avec `usePageContext(...)` (pour le panneau « Assistant NOOR »).
  - Couleurs des graphiques **validées** (daltonisme/contraste) dans `src/lib/chartColors.ts` : ne pas les changer au hasard.
  - Page de connexion : design dédié (vert pin `#0F3D3E`, safran `#E8A33D` réservé à « l'arrêt en cours »,
    police de titre Bricolage Grotesque, emblème étoile à 8 branches `components/brand/NoorMark.tsx`).
  - **Même identité dans l'application** : jetons `pine`, `mint`, `saffron`, `ink` (`src/index.css`, ex. `bg-pine`).
    Tableaux de bord : bandeau vert pin `components/dashboard/HeroBand.tsx` (rythme du mois) +
    tournée du jour dessinée comme un trajet `DayRoute.tsx` (safran = prochaine visite, et rien d'autre) ;
    KPIs regroupés dans un seul panneau `KpiStrip`. Titres en Bricolage (`font-display`), pas de libellés en majuscules.
- **Commits** en français, poussés sur `main` (pas de PR sauf demande).

## Données de démo (`backend/seed.py`)

- Rejouable : supprime et recrée la base. **Déterministe pour un même jour** (quelle que soit l'heure) ;
  l'historique est relatif à la date du jour (6 mois + 2 semaines de planning, tournée du samedi matin).
- 5 utilisateurs, 200 médecins (dont 10 quasi-doublons volontaires), 10 produits fictifs (molécules réelles),
  ~1 600 visites, objectifs mensuels (profils de performance par délégué), alertes,
  7 comptes-rendus mentionnant un effet indésirable.
- `seed_duplicates.md` (racine) est **généré** par le seed et **non versionné** (il bloquait `git pull`).

## Points d'extension IA (prêts, non implémentés)

- `backend/app/ai/` : `voice_report.py`, `rag_assistant.py`, `pharmacovigilance.py`, `card_scanner.py`,
  `recommendations.py` (docstrings détaillées) + formats `schemas.py`.
- Routes `/api/ai/...` (`app/api/ai.py`) : `NotImplementedError` → 501 « Bientôt disponible » ;
  fonctionnent automatiquement une fois la fonction implémentée. `GET /api/ai/status`.
- Frontend : `AiFeatureButton` (🎤 sur `VisitReportPage`, 📷 sur `DoctorFormPage`), `src/api/ai.ts`,
  `components/assistant/AssistantPanel.tsx` (reçoit le contexte de page).
- Guide complet : `docs/EXTENSIONS_IA.md`.

## Mise en ligne

- `Dockerfile` (build frontend → image Python 3.13, seed au démarrage, TZ Africa/Casablanca) et `render.yaml`
  (Render, offre gratuite, Francfort, auto-deploy). Le backend sert `frontend/dist` s'il existe.
- Guide : `docs/DEPLOIEMENT.md`. **État** : non encore déployé — Render demande une carte bancaire
  (vérification de 1 $) ; alternative sans carte : `cloudflared tunnel --url http://localhost:5173`
  (`allowedHosts` déjà configuré dans `vite.config.ts`).

## État d'avancement

Fait : étapes 1 à 5 du cahier des charges (backend, médecins, planning + carte, compte-rendu, tableaux de bord
délégué/superviseur, produits, objectifs, points d'extension IA, README, refonte de la page de connexion,
Dockerfile/Render, refonte des tableaux de bord délégué et superviseur).

Pistes pour la suite (à valider avec Fouad) :
1. Finaliser la mise en ligne (Render ou alternative).
2. Implémenter les modules IA (un par étudiant, voir `docs/EXTENSIONS_IA.md`).
3. Ajouter des tests automatisés (pytest pour les services, Playwright pour les parcours clés).
4. Polir l'interface (étendre l'identité aux autres pages : médecins, planning, objectifs ; mode sombre éventuel).

## Pièges connus

- Lancer `python seed.py` modifie la base : relancer le seed le matin d'une démo (agenda du jour à jour).
- La carte (OpenStreetMap) nécessite internet.
- Vérifier visuellement les changements d'interface (captures Playwright, ordinateur 1440 px + mobile 390 px).
