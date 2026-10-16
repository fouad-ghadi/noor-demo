# NOOR Demo — CRM pharmaceutique pour délégués médicaux

Réplique de démonstration d'un CRM pharma (type « NOOR ») avec des données fictives
mais réalistes, conçue pour accueillir ensuite des fonctionnalités d'IA
(compte-rendu vocal, assistant produit RAG, pharmacovigilance, scan de cartes de visite,
recommandations).

> Projet d'innovation — École Centrale Casablanca.
> Toutes les données (médecins, produits, visites) sont **fictives**.

## Structure

```
noor-demo/
├── backend/          API Python (FastAPI + SQLAlchemy + SQLite)
├── frontend/         Application web (React + Vite + TypeScript + Tailwind + shadcn/ui)
├── docs/products/    Documents produits (PDF) pour le futur assistant RAG
└── seed_duplicates.md  Doublons et notes de pharmacovigilance générés par le seed
```

## Lancer le backend

Prérequis : **Python 3.11+**.

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows : .venv\Scripts\activate
pip install -r requirements.txt

python seed.py                   # crée / réinitialise noor.db avec les données de démo
uvicorn app.main:app --reload    # API sur http://localhost:8000
```

Documentation interactive de l'API : **http://localhost:8000/docs**

> Les données sont générées par rapport à la date du jour (6 mois d'historique +
> 2 semaines de planning). Relancez `python seed.py` le matin d'une démo.

### Comptes de démo (mot de passe : `demo`)

| Rôle | Email | Région |
|---|---|---|
| Superviseur | nadia.tazi@noor-demo.ma | Toutes |
| Délégué (en avance) | youssef.elidrissi@noor-demo.ma | Casablanca |
| Délégué (dans les temps) | salma.berrada@noor-demo.ma | Rabat-Salé |
| Délégué (en retard) | hamza.aitlahcen@noor-demo.ma | Marrakech |
| Délégué (beaucoup d'annulations) | imane.fassifihri@noor-demo.ma | Fès-Meknès |

Dans l'API, l'utilisateur courant est transmis par l'en-tête `X-User-Id`
(démo, aucune vraie sécurité).

## Lancer le frontend

Prérequis : **Node.js 20+**. Le backend doit tourner en parallèle (autre terminal).

```bash
cd frontend
npm install
npm run dev                      # application sur http://localhost:5173
```

Les appels `/api/...` sont redirigés automatiquement vers le backend (port 8000).

**Tester sur téléphone** : le PC et le téléphone sur le même Wi-Fi, puis ouvrir
`http://<adresse-IP-du-PC>:5173` sur le téléphone (l'adresse s'affiche au lancement de `npm run dev`,
ligne « Network »).

### Organisation du frontend

```
frontend/src/
├── api/            client HTTP (client.ts) + types TypeScript des données (types.ts)
├── auth/           utilisateur connecté (connexion simulée, stocké dans le navigateur)
├── components/
│   ├── ui/         composants shadcn/ui (boutons, cartes, listes déroulantes...)
│   ├── layout/     sidebar, barre mobile, mise en page générale
│   ├── assistant/  panneau « Assistant NOOR » (point d'extension IA)
│   ├── shared/     éléments réutilisables (badges, en-têtes, états vides...)
│   └── visits/     planification de visite, historique des visites
├── hooks/          requêtes partagées (React Query), utilitaires
├── lib/            formatage français des dates, libellés, couleurs
└── pages/          un fichier par écran
```

> Les composants `components/ui/` suivent les modèles shadcn/ui (style « new-york ») ;
> le fichier `components.json` permet d'en ajouter d'autres avec `npx shadcn@latest add <nom>`.
