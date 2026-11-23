# CLAUDE.md — contexte du projet NOOR Demo

Ce fichier est lu automatiquement au début de chaque session Claude Code.
Il résume le projet, les conventions et l'état d'avancement.
Historique détaillé et plan jusqu'à la soutenance finale (8 déc. 2026) : **`docs/PASSATION.md`**.

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

Aussi sous Cursor / VS Code : `Terminal → Run Task… → NOOR : lancer l'application` (`.vscode/tasks.json`) ;
règles Cursor dans `.cursor/rules/projet-noor.mdc` (elles renvoient vers ce fichier).


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
  - **Même identité dans toute l'application** (refonte complète du gabarit) : jetons `pine`, `mint`, `mint-wash`,
    `saffron`, `saffron-ink`, `ink`, `paper`, `line` (`src/index.css`, ex. `bg-pine`, `border-line`).
    **Règle du safran = « maintenant »** : prochaine visite, aujourd'hui et l'heure actuelle dans le planning,
    mois en cours, date du jour dans la barre latérale (`components/shared/NextVisit.tsx`). Jamais ailleurs.
  - Boutons principaux vert pin ; cartes = « feuilles » à filet (titre séparé par un filet, sans ombre) ;
    statuts = point de couleur + libellé (`StatusPill` dans `shared/badges.tsx`, `dot` dans `lib/labels.ts`) ;
    segments = tuiles A (pin plein) / B (menthe) / C (contour). Titres en Bricolage (`font-display`),
    pas de libellés en majuscules, pas de « · » entre les informations (phrases simples).
  - **Refonte animée (22 nov. 2026)** : motif zellige « éclairé » `components/brand/ZelligeField.tsx` (SVG + variables CSS
    `--lx/--ly/--lr`, la lumière suit la souris, dérive seule sur mobile) sur la connexion, le menu, `HeroBand` et le monogramme
    de la fiche médecin ; `motion` (paquet npm, `motion/react`) pour la pastille du menu qui glisse (`layoutId`), le fondu entre
    pages, le rideau d'entrée de la connexion (`EntryCurtain`) prolongé par `EntryVeil` (AppLayout, drapeau `noor-entree`).
    Classes CSS partagées dans `index.css` : `noor-enter`, `line-reveal`, `bar-grow`, `now-pulse` (safran = maintenant), `rail-draw`.
    Chiffres qui comptent : `shared/AnimatedNumber.tsx`. Tout est coupé par prefers-reduced-motion. Aucun crédit Higgsfield utilisé.
  - Page de connexion : **seulement les 4 délégués** (le superviseur reste en base, accessible par email : demande de Fouad).
  - Tableaux de bord : bandeau `HeroBand` + tournée `DayRoute` ; fiche médecin avec monogramme ;
    compte-rendu en étapes reliées par un rail. Règle CSS `main .grid > * { min-width: 0 }` : évite les débordements mobiles.
- **Commits** en français, poussés sur `main` (pas de PR sauf demande).

## Données de démo (`backend/seed.py`)

- Rejouable : supprime et recrée la base. **Déterministe pour un même jour** (quelle que soit l'heure) ;
  l'historique est relatif à la date du jour (6 mois + 2 semaines de planning, tournée du samedi matin).
- Volumes calqués sur un vrai rapport d'activité : 5 utilisateurs, ~860 médecins (≈ 215 par délégué, ≈ 190 ciblés
  F1/F2, + 10 quasi-doublons), 10 produits fictifs (molécules réelles, BU chronique/aiguë, gamme), ~4 900 visites
  (8 à 12 par jour travaillé selon le profil), ~140 jours d'événements, objectifs mensuels, alertes,
  12 comptes-rendus à déclarer en pharmacovigilance, ~31 000 lignes de ventes (marché type IMS, `create_sales`,
  hasard séparé `random.Random(4242)` pour ne pas décaler le reste des données).
- Seed ≈ 11 s. Évaluation pharmacovigilance : 12/12 (7 effets + 5 situations particulières), 0 fausse alerte sur ~4 200 comptes-rendus.
  Le seed laisse 2 cas « à déclarer » (le plus récent de Youssef, et un oublié en retard) ; les autres sont déjà déclarés.
- `seed_duplicates.md` (racine) est **généré** par le seed et **non versionné** (il bloquait `git pull`).

## Réalité terrain du laboratoire partenaire (son vrai CRM s'appelle aussi « NOOR »)

Fouad a fourni (le 21 oct. 2026) des photos du vrai CRM, un rapport d'activité anonymisé, la procédure de
remontée des effets indésirables et les formations. **Ne jamais mettre leurs noms, chiffres ou documents dans le dépôt
ni sur le site public** : on reproduit seulement la structure et les formules, avec des données fictives.
- Vocabulaire : délégué = **VM**, superviseur = **DSM** ; calls (visites), contacts (médecins vus), ciblage, BU, gamme.
- Ciblage `Doctor.frequency` : **F1** = 1 visite/mois, **F2** = 2 visites/mois, `None` = hors cible ; potentiel = `segment` A/B/C.
  Territoires (secteurs IMS) : `seed_data/territories.py` (`Doctor.territory`, recalculé à la création / modification).
- Indicateurs (`services/activity_service.py`, page **Statistiques** `/statistiques`) : jours travaillés = jours ouvrés
  (samedi = ½) − événements (`models/event.py`) ; moyenne = visites / jours travaillés ; couverture = ciblés vus / ciblage ;
  CPA = F1 vus ≥ 1 fois + F2 vus ≥ 2 fois, / ciblage. Alertes et « médecins à revoir » se basent sur F1/F2.
- Ventes (`services/sales_service.py`, page **Analyse des ventes** `/ventes`, « Mes performances » pour un délégué) :
  PM, QP, QM, IE = PM n / PM n-1 × 100, IP = PM locale / PM nationale × 100, évolution ; données M-1 (comme IMS).
  Le copilote (`recommendations.py`) ajoute une raison quand un produit perd des parts sur le territoire (IE < 97).
- Compte-rendu : statut de prescription annoncé (`Visit.prescription_feedback`) et **n° de lot** des échantillons.
- Demandes IA explicites du partenaire : chatbot (produits, infos médicales, **fonctionnement du CRM**), copilote,
  **création de médecin depuis une carte de visite + doublons**. Procédure PV réelle : 4 infos minimales (produit,
  effet ou situation particulière, patient identifiable, notificateur identifiable), déclaration **sous 24 h**.

## Modules IA (5 implémentés sur 5)

- `backend/app/ai/` : **implémentés** `voice_report.py`, `rag_assistant.py`, `pharmacovigilance.py`, `recommendations.py`,
  `card_scanner.py`. Formats : `schemas.py`.
- Principe : **tout marche sans clé** (règles, BM25) ; si `ANTHROPIC_API_KEY` est définie, Claude (`claude-opus-5-5`,
  sorties JSON structurées, `fallbacks: "default"`) via `app/ai/llm.py`, avec retour aux règles en cas d'erreur.
- Dictée : transcription par le navigateur (Web Speech API, fr-FR / ar-MA) dans `components/visits/VoiceDictationDialog.tsx`,
  extraction par mots-clés darija/français ; formulaire pré-rempli, `report_source="dictee"`, relu par le délégué.
- Assistant : RCP simplifiés `docs/products/<Produit>/rcp_<Produit>.md` (8 sections ; liés aux documents RCP par `file_path`),
  BM25 + citations (section), refus si hors documents (ex. prix). Panneau `components/assistant/AssistantPanel.tsx`.
  Aiguillage dans `rag_assistant.answer` : « mes chiffres » → `ai/crm_data.py` (5 outils : indicateurs, médecins à voir,
  tournée, objectifs, comptes-rendus en attente ; tool use avec Claude via `llm.run_tools`, mots-clés sinon ; droits via
  `access`) ; « comment… » → guide `docs/guide/guide_noor.md` (`ai/crm_guide.py`, à tenir à jour quand un écran change) ;
  sinon RCP. Réponse : `kind` (produit/guide/donnees) + `Citation.link` (page où vérifier).
- Pharmacovigilance : analyse à chaque `submit_report` (`visit_service._scan_pharmacovigilance`) et `scan_all` à la fin du seed ;
  alertes PV en tête de liste. Évaluation : `backend/scripts/evaluer_pharmacovigilance.py` (12/12, 0 fausse alerte).
  **Conforme à la procédure** : effets + situations particulières (grossesse/allaitement, surdosage, mésusage,
  erreur médicamenteuse, manque d'efficacité) ; table `pv_cases` (`models/pharmacovigilance.py`) ;
  `services/pharmacovigilance_service.py` = 4 infos minimales, délai 24 h depuis la visite (urgent < 6 h),
  déclaration pré-remplie (e-mail fictif `pharmacovigilance@noor-demo.ma`), « Marquer comme déclarée » (délégué seul).
  Une alerte PV ne se ferme qu'en déclarant. Pages `/pharmacovigilance` et `/pharmacovigilance/:id`.
- Carte de visite : photo / import / 4 cartes d'exemple (`frontend/public/demo-cards/`, `scripts/generer_cartes_demo.py`).
  Avec clé : Claude vision ; sans clé : OCR Tesseract.js dans le navigateur (`src/lib/cardImage.ts`, fichiers servis par NOOR dans `/ocr`, copiés par `frontend/scripts/copier-ocr.mjs` avant dev/build ; plus de CDN ; cartes d'exemple : texte connu si l'OCR échoue)
  + règles `extract_fields`. Doublons : `services/duplicate_service.py` (cherchés dans toute la base, fiche d'un collègue
  signalée sans accès), vérifiés aussi pendant la saisie manuelle ; « Compléter cette fiche » → page de modification
  pré-remplie par `/ai/card-scanner/merge` (graphie de la base gardée, ancien téléphone noté). Éval. `scripts/evaluer_doublons.py` : 10/10, 0 fausse alerte.
- **Tests** : `cd backend ; pip install -r requirements-dev.txt ; python -m pytest` (base de démo temporaire via `NOOR_DB_PATH`,
  la vraie base n'est pas touchée ; `tests/pharmacovigilance/` utilise sa propre petite base en mémoire).
- **Demandes du laboratoire (22 nov. 2026, tout sans clé, « l'IA propose, le délégué valide », pourquoi toujours affiché)** :
  `ai/potential.py` (potentiel A/B/C = patients/jour 70 pts + prescription 30 pts, fréquence conseillée, « Appliquer » ;
  carte `components/doctors/PotentialCard.tsx`), `ai/visit_prep.py` (« Préparer la visite » : produits scorés + pourquoi,
  argument, échantillons + lot ; `components/visits/VisitPrepSheet.tsx`, depuis la fiche médecin ou une visite à venir),
  `ai/week_planner.py` (« Remplir ma semaine » : quartiers + jours de réception, cases à décocher puis validation ;
  `components/planning/FillWeekDialog.tsx`), `ai/sales_insights.py` (carte « Ce que NOOR en déduit » sur `/ventes`),
  `ai/closing.py` (« Clôturer ma journée / mon mois » sur le tableau de bord, `components/dashboard/ClosingDialog.tsx`),
  `ai/medical_info.py` (fiches `docs/medical/fiche_*.md`, `kind="medical"`). Phrases prédéfinies du compte-rendu :
  `src/lib/reportPhrases.ts`. Nouveaux champs : `Doctor.patients_per_day`, `Doctor.reception_days` ("1,3" = mar. et jeu.),
  `Product.channel/margin_level/peak_months/sample_unit` (seed : `add_cabinet_profiles`, hasard séparé `Random(2027)`).
  Tests : `backend/tests/test_sothema.py`. Guide du chatbot : sections 19 à 25 (25 = scan de carte).
- Recommandations : carte « Visites recommandées » (`components/dashboard/RecommendedVisits.tsx`) avec « Planifier ».
- Catalogue médicaments (`/produits`, `pages/products/ProductsPage.tsx`) : grille animée (CSS, coupée par
  prefers-reduced-motion), filtres par gamme + recherche (`src/lib/catalogue.ts`, testé par `npm test` / vitest),
  aperçu latéral, mode plein écran « Présenter au médecin » (`components/catalogue/PresentationMode.tsx`, flèches, balayage).
  Photos de boîtes générées avec Higgsfield (22 nov. 2026, marque fictive « NOOR », fond détouré) dans
  `frontend/public/products/<produit>.webp` ; boîte dessinée en CSS si un visuel manque (`GENERATED_PACKSHOTS`).
- Explications pour le jury : `docs/IA_explications_jury.txt` ; guide technique : `docs/EXTENSIONS_IA.md`.

## Mise en ligne

- `Dockerfile` (build frontend → image Python 3.13, seed au démarrage, TZ Africa/Casablanca) et `render.yaml`
  (Render, offre gratuite, Francfort, auto-deploy). Le backend sert `frontend/dist` s'il existe.
- Guide : `docs/DEPLOIEMENT.md`. **État** : en ligne sur **https://noor-demo.onrender.com** (offre gratuite,
  chaque push sur `main` redéploie). Anti-veille : **en place** depuis le 18 oct. 2026 (moniteur UptimeRobot toutes les 5 min, compte de Fouad).
  Comme le service ne redémarre plus, `app/services/daily_reseed.py` relance `seed.py` chaque nuit à 4 h
  (activé par `NOOR_DAILY_RESEED=1` dans le `Dockerfile` ; inactif en local).
  Alternatives étudiées sans carte : Azure for Students (100 $, 12 mois), Hugging Face Spaces (veille, offre incertaine).

## État d'avancement

Fait : étapes 1 à 5 du cahier des charges (backend, médecins, planning + carte, compte-rendu, tableaux de bord
délégué/superviseur, produits, objectifs, points d'extension IA, README, refonte de la page de connexion,
Dockerfile/Render, refonte complète du gabarit : toutes les pages, 4 modules IA).
22 oct. 2026 : alignement sur le vrai CRM du partenaire (ciblage F1/F2, territoires, événements d'agenda,
page Statistiques, analyse des ventes type IMS, n° de lot, statut de prescription, volumes réalistes).

22 nov. 2026 : pharmacovigilance conforme, scan de carte de visite + doublons (5e module IA), assistant étendu
(mode d'emploi du CRM, « mes chiffres ») ; premiers tests automatisés
(`backend/tests/`, `python -m pytest` : base temporaire via `NOOR_DB_PATH`, la vraie base n'est pas touchée).

22 nov. 2026 (soir) : demandes du laboratoire intégrées (potentiel A/B/C expliqué, Préparer la visite,
Remplir ma semaine, conclusions des ventes, phrases prédéfinies, clôture jour/mois, fiches médicales du chatbot).
Reste de leur liste : saisie hors-ligne (option).

Pistes pour la suite (à valider avec Fouad ; MVP le 8 déc. 2026) :
1. ~~Pharmacovigilance conforme~~ : fait le 22 nov. 2026 (PR « pharmacovigilance conforme »).
2. Chatbot étendu : mode d'emploi du CRM, « quel est mon CPA ? » et informations médicales (nos fiches) **faits** (22 nov.).
3. IA : tester avec une clé `ANTHROPIC_API_KEY` ; étendre les tests (pytest : autres services ; Playwright).
4. Mise en ligne : vérifier une fois dans les journaux Render la ligne « Données de démo régénérées pour le … » (4 h du matin).

## Tests automatiques

`backend/` : `pip install -r requirements-dev.txt` puis `python -m pytest` (base temporaire via `NOOR_DB_PATH`,
jamais `noor.db` ; seed rejoué une fois, ≈ 10 s ; Claude simulé, sans réseau). Couvre l'assistant (aiguillage, chiffres
identiques aux services, droits d'accès, boucle d'outils), le scan de carte + doublons et la pharmacovigilance
(`tests/pharmacovigilance/`, petite base en mémoire).

## Pièges connus

- Lancer `python seed.py` modifie la base : relancer le seed le matin d'une démo (agenda du jour à jour).
- La carte (OpenStreetMap) nécessite internet.
- `useEffect(() => fn())` sans accolades : si `fn` renvoie une promesse (`scrollIntoView`, `scrollTo` dans Chrome récent),
  React plante (« d/l is not a function »). Toujours écrire `useEffect(() => { fn(); }, …)`.
- Vérifier visuellement les changements d'interface (captures Playwright, ordinateur 1440 px + mobile 390 px).
