# Documents produits

Dossier destiné aux documents officiels des produits (PDF) :
RCP, notices patients, supports promotionnels validés.

Ils sont indexés par l'assistant produit (RAG, `backend/app/ai/rag_assistant.py`),
qui ne répond **qu'à partir de ces documents**, avec citations.

**Aujourd'hui** : chaque produit a un RCP simplifié en texte, `<Produit>/rcp_<Produit>.md`
(8 sections numérotées « ## n. Titre » ; une section = un passage citable). Fiches de démonstration :
noms commerciaux fictifs, informations simplifiées à partir des RCP publics des molécules.

Convention proposée : `docs/products/<NomProduit>/<type>_<NomProduit>.pdf`
(ex. `docs/products/Cardiovex/rcp_Cardiovex.pdf`), puis renseigner le champ
`file_path` de la table `documents`.
