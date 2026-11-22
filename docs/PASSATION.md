# Passation — NOOR Demo (à lire au début d'une nouvelle session)

Mis à jour le 22 novembre 2026. Complète `CLAUDE.md` (conventions, architecture) : ce fichier-ci raconte
**ce qui a été fait, ce qui reste à faire et dans quel ordre** jusqu'à la soutenance finale.

---

## 1. Le projet en bref

- **Quoi** : réplique de démonstration d'un CRM pharmaceutique pour délégués médicaux (« NOOR »),
  enrichie de modules d'IA. Projet d'innovation de 5 étudiants de l'École Centrale Casablanca,
  en partenariat avec un laboratoire pharmaceutique marocain (dont le vrai CRM s'appelle aussi NOOR).
- **Propriétaire** : Fouad (GitHub `fouad-ghadi`). Windows / PowerShell, débutant en outillage :
  toujours donner des commandes PowerShell exactes, pas à pas.
- **Dépôt** : https://github.com/fouad-ghadi/noor-demo (branche `main`).
- **Site en ligne** : https://noor-demo.onrender.com (Render, offre gratuite ; chaque push sur `main` redéploie).
  Anti-veille UptimeRobot (compte de Fouad) ; données régénérées chaque nuit à 4 h (`daily_reseed.py`).
- **Comptes de démo** (mot de passe `demo`, domaine `@noor-demo.ma`) : `nadia.tazi` (superviseure, DSM),
  `youssef.elidrissi` (en avance), `salma.berrada` (dans les temps), `hamza.aitlahcen` (en retard),
  `imane.fassifihri` (en retard, annulations).

## 2. Calendrier

| Date | Étape | État |
|---|---|---|
| 20 oct. 2026 | Session de feedback avec les entreprises partenaires | faite |
| 22 oct. 2026 | Soutenance « pitch » (5 min + 15-20 min d'échange) | faite |
| **8 déc. 2026** | **Soutenance finale : présentation du MVP** | **à préparer** |

## 3. Ce qui est fait (dans l'ordre)

1. **Socle CRM** (FastAPI + SQLite / React + Vite + Tailwind) : médecins, planning (semaine, jour, carte
   Leaflet), compte-rendu de visite en étapes, tableaux de bord délégué et superviseur, produits, objectifs,
   alertes métier, droits d'accès (un délégué ne voit que ses données).
2. **Identité visuelle complète** (vert pin, menthe, safran réservé à « maintenant », Bricolage Grotesque),
   mobile d'abord pour les délégués.
3. **Mise en ligne** : Dockerfile + render.yaml, site toujours éveillé, reseed quotidien.
4. **4 modules IA** (tous marchent sans clé ; Claude en option avec `ANTHROPIC_API_KEY`, retour aux règles sinon) :
   - compte-rendu **dicté** en darija / français (transcription navigateur, extraction par mots-clés) ;
   - **assistant produit** (RAG BM25 sur des RCP simplifiés, citations, refus hors documents) ;
   - **pharmacovigilance** (détection d'effets indésirables dans les comptes-rendus → alerte ; 7/7, 0 fausse alerte) ;
   - **visites recommandées** (score expliqué : fréquence de ciblage, potentiel, produits, part de marché, créneau).
   - **scan de carte de visite + doublons** (22 nov.) : photo → fiche pré-remplie (Claude vision, ou OCR du
     navigateur + règles sans clé), doublons signalés avant l'enregistrement avec score et raisons,
     « Compléter cette fiche » ou créer ; 10/10 paires du seed, 0 fausse alerte ; 36 tests pytest.
5. **Fiabilité** : filets de sécurité d'affichage (ErrorBoundary avec réparation automatique), protection contre
   la traduction automatique du navigateur, carte sans animation de zoom (plantage Leaflet corrigé),
   noms de composants conservés en production pour diagnostiquer.
6. **Alignement sur le vrai CRM du partenaire** (21-22 oct., d'après leurs photos et documents) :
   ciblage **F1/F2**, territoires, événements d'agenda, page **Statistiques** (moyenne de visites / jour,
   couverture, CPA), **Analyse des ventes** type IMS (PM, QP, QM, IE, IP, concurrents fictifs),
   n° de lot des échantillons, statut de prescription annoncé, volumes réalistes (~860 médecins, ~11 visites / jour).
7. **Livrables de présentation** : deck de feedback (artifact Slides), pitch du 22 oct. (PowerPoint sur le modèle
   Canva de l'équipe, avec script oral dans les notes), fichier `docs/IA_explications_jury.txt`.
8. **Outils** : compétence de design **Impeccable** dans `.claude/skills/impeccable` (`/impeccable audit`, `polish`...).

## 4. Ce que le partenaire attend (son mail, ses documents)

Trois demandes IA explicites :
1. **Chatbot intégré** : questions sur les produits, les **informations médicales** et le **fonctionnement du CRM**.
2. **Copilote** : recommandations, alertes et conseils pour le ciblage, la planification, les visites, les objectifs.
3. **Création automatique des médecins** depuis une **photo de carte de visite**, avec **détection des doublons**
   avant validation par l'administrateur.

Procédure réelle de pharmacovigilance : 4 informations minimales (produit du laboratoire ; effet indésirable **ou
situation particulière** : manque d'efficacité, surdosage, mésusage, grossesse / allaitement, erreur médicamenteuse ;
patient identifiable ; notificateur identifiable — à défaut, au moins les deux premières), envoi à l'équipe de
pharmacovigilance par e-mail, **dans les 24 heures**.

⚠️ **Confidentialité** : ne jamais mettre dans le dépôt ni sur le site les noms, chiffres, adresses e-mail ou documents
du partenaire. On reproduit la structure et les formules avec des données fictives (adresse de démo :
`pharmacovigilance@noor-demo.ma`, par exemple).

## 5. Ce qui reste à faire d'ici le 8 décembre (par priorité)

### P1. Pharmacovigilance conforme à la procédure réelle
- Détecter aussi les **situations particulières** (surdosage, mésusage, grossesse / allaitement, manque d'efficacité,
  erreur médicamenteuse) dans `app/ai/pharmacovigilance.py`, sans casser l'évaluation (7/7, 0 fausse alerte).
- Pour chaque alerte : **liste des 4 informations** (trouvées / manquantes), **compte à rebours 24 h**
  depuis la visite, bouton « Préparer la déclaration » → fiche pré-remplie (produit, effet, patient anonymisé,
  médecin notificateur, délégué, date) à relire, puis « Marquer comme déclarée » (statut + date).
- Mettre à jour `scripts/evaluer_pharmacovigilance.py` et les explications jury.

### P2. Scan de carte de visite + doublons (demande n° 3 du partenaire) — ✅ FAIT le 22 nov. 2026
Reste possible : liste des doublons de toute la base pour le superviseur (`duplicate_service.find_all_pairs` existe),
tester la lecture par Claude avec une vraie clé et de vraies photos (reflets, cartes bilingues).
Plan d'origine :
- Frontend : prise de photo (mobile) ou import d'image dans `DoctorFormPage` (bouton 📷 aujourd'hui désactivé).
- Extraction : avec clé, **Claude (vision)** renvoie un JSON (nom, prénom, spécialité, adresse, ville, téléphone,
  e-mail) ; sans clé, OCR dans le navigateur (ex. Tesseract.js) + règles. Le délégué relit toujours.
- **Doublons** : normalisation (accents, « El », tirets, translittérations Ouazzani / Wazzani, Mohammed / Mohamed,
  formats de téléphone) + score de similarité ; afficher les fiches proches avant création. Le seed contient
  **10 paires de quasi-doublons** pour la démo (`seed_duplicates.md`, généré).
- `source="carte_de_visite"` sur la fiche créée.

### P3. Chatbot étendu
- **Mode d'emploi du CRM** : petit guide en markdown (`docs/guide/…`) indexé comme les RCP.
- **« Quel est mon CPA ? », « Quels médecins F2 n'ai-je pas vus ? »** : reconnaître ces questions et répondre
  avec les données (`activity_service`, `stats_service`), toujours en citant la source.
- **Informations médicales** : rédiger nos propres fiches simplifiées (antibiothérapie, bactériologie...) ;
  ne pas copier les formations du partenaire sans autorisation.

### P4. Agent « Prépare ma tournée » (piste présentée au pitch)
- Le délégué demande « Prépare ma tournée de mardi » → l'agent propose une liste ordonnée (visites recommandées,
  créneaux, carte), le délégué confirme, les visites sont planifiées. Toujours « l'IA propose, le délégué valide ».

### P5. Qualité et soutenance
- Tests automatisés : pytest (services, droits d'accès, indicateurs, ventes), Playwright (connexion, compte-rendu,
  planning), lancés avant chaque push.
- Passe de design avec `/impeccable audit` puis `polish` sur les pages clés.
- Soutenance du 8 déc. : deck (problème, solution, démo, résultats mesurés, suite), **scénario de démo minuté**,
  **vidéo de secours** de la démo, réponses aux questions probables (fiabilité de l'IA, données de santé /
  loi 09-08, coût, intégration au vrai NOOR).

## 6. Points d'attention connus

- Erreur « l is not a function » signalée par Fouad (filet global) : **non reproduite** ; depuis, le message
  affiche le nom du composant en cause : demander une capture si elle revient.
- Render gratuit : premier chargement plus lent après un déploiement ; seed ≈ 11 s.
- Les sessions cloud de Claude Code n'accèdent pas à `noor-demo.onrender.com` : Fouad vérifie lui-même après déploiement.
- Les plugins Claude Code ne sont pas disponibles dans les sessions cloud (d'où la compétence copiée dans le dépôt).
- Alternative gratuite à Claude discutée (Gemini) : non implémentée.

## 7. Méthode de travail attendue

1. Lire `CLAUDE.md` puis ce fichier.
2. Faire valider à Fouad la priorité du jour (par défaut : P1, puis P2).
3. Coder en suivant les conventions (logique dans `app/services/`, commentaires en français, interface 100 % française).
4. Vérifier : relancer `python seed.py`, tester l'API, captures Playwright (1440 px et 390 px), évaluation PV.
5. Commit en français, push sur `main` (Render redéploie), mettre à jour `CLAUDE.md` / ce fichier.
6. Expliquer à Fouad en termes simples ce qui a changé et comment le montrer au jury.
