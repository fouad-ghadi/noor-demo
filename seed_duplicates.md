# Données de démo particulières

_Fichier généré automatiquement par `backend/seed.py` (les identifiants peuvent changer si le seed est relancé un autre jour : relisez ce fichier après chaque seed)._

## 1. Quasi-doublons de médecins (démo de la détection de doublons)

Chaque paire désigne **le même médecin** saisi deux fois avec une graphie différente (translittération arabe → français, espaces, accents, format du téléphone). La fiche « doublon » est récente, souvent créée depuis une carte de visite ou un import.

| # | Fiche d'origine (id) | Doublon (id) | Ville | Ce qui diffère |
|---|---|---|---|---|
| 1 | Mohammed El Amrani (1) — 05 22 25 14 78 | Mohamed Elamrani (191) — +212 522-251478 | Casablanca | Prénom Mohammed/Mohamed, nom collé, même téléphone au format international |
| 2 | Karim Benjelloun (2) — 05 22 47 30 12 | Karim Ben Jelloun (192) — 0522473012 | Casablanca | Nom Benjelloun/Ben Jelloun, même téléphone sans espaces |
| 3 | Fatima Zahra Alaoui (3) — 06 61 23 45 67 | Fatima-Zahra Alaoui (193) — 0661234567 | Casablanca | Prénom composé avec tiret, adresse écrite autrement, même mobile |
| 4 | Youssef Ouazzani (53) — 05 37 77 18 42 | Youssef Wazzani (194) — 05 37 77 18 42 | Rabat | Translittération Ouazzani/Wazzani, même adresse et téléphone |
| 5 | Khadija Benkirane (54) — 05 37 56 90 11 | Khadija Ben Kirane (195) — 05 37 56 90 11 | Rabat | Nom Benkirane/Ben Kirane, même email et même téléphone |
| 6 | Abdelaziz Chraibi (55) — 05 37 65 43 29 | Abdelaziz Chraïbi (196) — 05.37.65.43.29 | Rabat | Tréma Chraibi/Chraïbi (fiche recréée à la main), téléphone avec points |
| 7 | Hicham El Idrissi (101) — 05 24 43 18 90 | Hicham Idrissi (197) — 0524-43-18-90 | Marrakech | Article « El » omis, téléphone avec tirets |
| 8 | Said Tahiri (102) — 06 68 12 77 30 | Saïd Ettahiri (198) — +212 668 127 730 | Marrakech | Said/Saïd et Tahiri/Ettahiri (article assimilé), même mobile |
| 9 | Noureddine Sqalli (147) — 05 35 62 14 08 | Nourdine Skalli (199) — 05 35 62 14 08 | Fès | Noureddine/Nourdine et Sqalli/Skalli, même adresse et téléphone |
| 10 | Meryem Lahlou (148) — 06 71 55 03 26 | Maryam Lahlou (200) — 0671550326 | Fès | Meryem/Maryam, même mobile sans espaces |

## 2. Comptes-rendus mentionnant un effet indésirable (démo pharmacovigilance)

Ces visites contiennent dans leurs notes une mention d'effet indésirable. Le futur module `app/ai/pharmacovigilance.py` devra les détecter.

| Visite (id) | Médecin | Produit | Date |
|---|---|---|---|
| 1154 | Dr Yassine Tahiri | Amoxira | 08/09/2026 |
| 1536 | Dr Fatima Zahra Bekkali | Cardiovex | 24/09/2026 |
| 310 | Dr Karim Zniber | Glucanor | 25/08/2026 |
| 1476 | Dr Noureddine Sqalli | Statilia | 15/08/2026 |
| 1532 | Dr Abderrahim Benabdellah | Artrinol | 21/09/2026 |
| 746 | Dr Youssef Ouazzani | Respiflow | 22/08/2026 |
| 291 | Dr Houda Ouali | Gestavia | 19/08/2026 |
