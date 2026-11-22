# Guide : implémenter les modules d'IA

Ce guide explique comment brancher chacune des 5 fonctionnalités d'IA sur le CRM.
L'application est prête : chaque module a son fichier, sa route API, son format
d'échange et son emplacement dans l'interface. **Un module = un fichier à compléter.**

## Principe commun

```
Frontend (bouton / panneau)  ──►  /api/ai/<fonction>  ──►  app/ai/<module>.py  ──►  app/services/...
        src/api/ai.ts               app/api/ai.py            (à implémenter)          (logique métier)
```

1. **Lire** le docstring en tête du module (`backend/app/ai/<module>.py`) : objectif, pipeline proposé, données de test.
2. **Implémenter** les fonctions qui lèvent `NotImplementedError`, en respectant les formats de `backend/app/ai/schemas.py`.
3. **Tester** dans http://localhost:8000/docs (section « IA (à venir) ») : la route ne répond plus 501.
   `GET /api/ai/status` affiche `"implemented": true`.
4. **Activer** le bouton dans le frontend : passer `enabled` et `onClick` au composant `AiFeatureButton`.
5. **Ajouter les dépendances** dans `backend/requirements.txt`, et les importer **dans les fonctions**
   (pas en haut du fichier) pour que le backend démarre même sans elles.

Règles :
- Lire et écrire les données **via `app/services/`** (ex. `visit_service.submit_report`,
  `doctor_service.create_doctor`) : droits d'accès, alertes et KPIs restent cohérents.
- L'IA **propose**, l'humain **valide** : un compte-rendu dicté ou une fiche scannée est
  toujours relu avant enregistrement.
- Toujours **expliquer** le résultat (citations, raisons, extraits).

## État (octobre 2026)

| Module | État | Méthode sans clé | Avec `ANTHROPIC_API_KEY` |
|---|---|---|---|
| 🎤 Compte-rendu dicté | ✅ implémenté | transcription par le navigateur + mots-clés (darija / français) | extraction structurée par Claude |
| 💬 Assistant produit | ✅ implémenté | recherche BM25 dans les RCP simplifiés + réponse extraite, citée | réponse rédigée par Claude à partir des seuls passages trouvés |
| ⚠️ Pharmacovigilance | ✅ implémenté | règles (symptôme ou situation particulière + cas réel + exposition, sans « crainte ») : 12/12, 0 fausse alerte ; 4 infos minimales, délai 24 h, déclaration pré-remplie | détection par Claude (comptes-rendus enregistrés) |
| ✨ Recommandations | ✅ implémenté | score expliqué (retard selon F1/F2, potentiel, opportunités produit, part de marché, créneau) | — |
| 📷 Carte de visite + doublons | ✅ implémenté | OCR dans le navigateur (Tesseract.js) + règles ; doublons : normalisation + score expliqué (10/10, 0 fausse alerte) | Claude lit directement la photo (vision) |

Code commun : `app/ai/llm.py` (appel à Claude, sorties JSON garanties, retour aux règles en cas d'erreur).

## Répartition possible (5 étudiants, 5 modules)

| Module | Fichier | Difficulté | Données de test déjà dans la base |
|---|---|---|---|
| 🎤 Compte-rendu dicté | `voice_report.py` | ★★★ | n'importe quelle visite « compte-rendu à faire » |
| 💬 Assistant produit (RAG) | `rag_assistant.py` | ★★★ | 10 produits, 30 documents (déposer les PDF dans `docs/products/`) |
| ⚠️ Pharmacovigilance | `pharmacovigilance.py` | ★★ | 12 comptes-rendus à déclarer (7 effets + 5 situations particulières) (`seed_duplicates.md`, section 2 — fichier créé par `python seed.py`) |
| 📷 Carte de visite + doublons | `card_scanner.py` | ★★ | 10 paires de doublons (`seed_duplicates.md`, section 1) |
| ✨ Recommandations | `recommendations.py` | ★★ | 6 mois d'historique, créneaux, prescriptions, objectifs |

---

## 🎤 Compte-rendu dicté — `voice_report.py`

- **Entrée** : `VoiceReportRequest` (visit_id, audio en base64 ou transcription, langue).
- **Sortie** : `VoiceReportResult` (transcription, brouillon `VisitReport`, champs incertains).
- **Étapes** : speech-to-text (Whisper / faster-whisper, tester la darija) → extraction structurée
  par un LLM (donner la liste des produits et des catégories d'objections) → brouillon.
- **Frontend** : `pages/visits/VisitReportPage.tsx`, bouton « 🎤 Dicter le compte-rendu ».
  Enregistrer l'audio avec l'API `MediaRecorder` du navigateur, appeler `aiApi.voiceReport(...)`,
  pré-remplir les états du formulaire avec `draft`, envoyer `report_source: "dictee"` à la validation.
  Le badge « 🎤 Dicté » s'affiche déjà dans l'historique des visites.

## 💬 Assistant produit — `rag_assistant.py`

- **Entrée** : `AskRequest` (question + contexte de la page : médecin, visite, produit affichés).
- **Sortie** : `AskResponse` (réponse, citations avec document / page / extrait, `refused`).
- **Étapes** : indexer les PDF de `docs/products/` (découpage + embeddings + index vectoriel) →
  rechercher les passages → réponse du LLM **uniquement** à partir des passages, avec citations.
  Si rien de pertinent : `refused=True` et le dire.
- **Frontend** : `components/assistant/AssistantPanel.tsx` — activer le champ de saisie,
  appeler `aiApi.ask(question, context)`, afficher la réponse et les citations.
  Le contexte de la page est déjà fourni en props (`context`).

## ⚠️ Pharmacovigilance — `pharmacovigilance.py`

- **Entrée** : `PharmacovigilanceRequest` (visit_id ou texte).
- **Sortie** : `PharmacovigilanceResult` (signaux : produit, effet, extrait, gravité, confiance ; alertes créées).
- **Étapes** : détecter les mentions d'effets indésirables → créer
  `Alert(type="pharmacovigilance", severity="haute", visit_id, doctor_id)`.
  L'alerte apparaît automatiquement dans le tableau de bord (le type est déjà géré).
- **Évaluation** : 7 vrais positifs connus (`seed_duplicates.md`) parmi ~4 000 comptes-rendus :
  mesurer précision et rappel.
- **Automatisation** : appeler `scan(...)` à la fin de `visit_service.submit_report`.

## 📷 Carte de visite + doublons — `card_scanner.py`

✅ **Implémenté.**
- **Entrée** : `CardScanRequest` (photo en base64 **ou** texte déjà lu par l'OCR du navigateur).
- **Sortie** : `CardScanResult` (texte lu, champs `CardFields`, doublons avec score, niveau et raisons,
  `needs_ocr` quand le serveur n'a pas de clé et qu'il faut lire la photo dans le navigateur).
- **Lecture** : avec clé, Claude (vision) ; sans clé, Tesseract.js dans le navigateur (`src/lib/cardImage.ts`)
  puis `extract_fields` (titre « Dr », mots-clés de spécialité, numéros marocains, villes et quartiers connus).
- **Doublons** : `app/services/duplicate_service.py` (téléphone = 9 derniers chiffres, nom sans accents ni
  article « El / Et », translittérations ou→w, q→k, lettres doublées, adresse) ; cherchés dans toute la base,
  une fiche d'un collègue est signalée sans accès. Routes : `POST /api/ai/card-scanner/duplicates`
  (vérification pendant la saisie) et `/merge` (fiche existante complétée, rien n'est enregistré).
- **Évaluation** : `python scripts/evaluer_doublons.py` → 10/10 paires, 0 fausse alerte sur ~860 fiches.
- **Frontend** : `components/doctors/CardScanDialog.tsx` (photo, import ou 4 cartes d'exemple dans
  `public/demo-cards/`), `DuplicatePanel.tsx` (« Compléter cette fiche » / « Ce n'est pas le même médecin »).
- **Tests** : `backend/tests/test_card_scanner.py` (`python -m pytest`).

## ✨ Recommandations — `recommendations.py`

- **Entrée** : délégué (ou équipe pour le superviseur), nombre de recommandations.
- **Sortie** : liste de `VisitRecommendation` (médecin, date et créneau conseillés, produits à présenter, raisons, score).
- **Signaux utilisés** : retard de visite rapporté à la fréquence de ciblage (F2 : 15 j, F1 : 30 j, hors cible : 90 j),
  potentiel A/B/C, réceptivité par créneau, statuts de prescription, objections passées, objectifs du mois en retard,
  et données de marché : `sales_service.evolution_index_by_territory` (produit qui perd des parts de marché
  sur le territoire du médecin, indice d'évolution < 97).
- **Frontend** : ajouter une carte « Visites recommandées » sur le tableau de bord
  (`pages/dashboard/DashboardPage.tsx`), avec un bouton « Planifier » (réutiliser `PlanVisitDialog`).
