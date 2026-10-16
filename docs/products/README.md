# Documents produits

Dossier destiné aux documents officiels des produits (PDF) :
RCP, notices patients, supports promotionnels validés.

Ils seront indexés plus tard par l'assistant produit (RAG, `backend/app/ai/rag_assistant.py`),
qui ne répondra **qu'à partir de ces documents**, avec citations.

Convention proposée : `docs/products/<NomProduit>/<type>_<NomProduit>.pdf`
(ex. `docs/products/Cardiovex/rcp_Cardiovex.pdf`), puis renseigner le champ
`file_path` de la table `documents`.
