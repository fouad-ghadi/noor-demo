"""
╔══════════════════════════════════════════════════════════════════════╗
║  MODULES D'INTELLIGENCE ARTIFICIELLE — POINTS D'EXTENSION            ║
╚══════════════════════════════════════════════════════════════════════╝

Chaque fichier de ce dossier correspond à UNE fonctionnalité IA future.
Aujourd'hui, toutes les fonctions lèvent `NotImplementedError` : les routes
/api/ai/... répondent alors « 501 — pas encore disponible ».

Dès qu'une fonction est implémentée, la route correspondante fonctionne
automatiquement (voir app/api/ai.py) : rien d'autre à brancher.

| Module                 | Fonctionnalité                                         | Route API                         |
|------------------------|--------------------------------------------------------|-----------------------------------|
| voice_report.py        | Dictée vocale (darija / français) → compte-rendu       | POST /api/ai/voice-report         |
| rag_assistant.py       | Questions produits, réponses AVEC citations (RAG)      | POST /api/ai/assistant/ask        |
| pharmacovigilance.py   | Détection d'effets indésirables dans les comptes-rendus | POST /api/ai/pharmacovigilance/scan |
| card_scanner.py        | Scan de carte de visite + détection de doublons        | POST /api/ai/card-scanner         |
| recommendations.py     | Quels médecins voir, quand, avec quels produits        | GET  /api/ai/recommendations      |

Règles communes :
- Les formats d'entrée / sortie sont définis dans `schemas.py` (contrat entre équipes).
- Toujours passer par la couche `app/services/` pour lire ou écrire les données métier
  (ex. `visit_service.submit_report`, `doctor_service.create_doctor`) : les règles
  métier (droits d'accès, alertes, KPIs) restent ainsi appliquées.
- Les dépendances lourdes (whisper, transformers, faiss...) s'importent DANS les
  fonctions, pour que le backend démarre même si elles ne sont pas installées.
"""

# Liste utilisée par GET /api/ai/status (le frontend saura quelles fonctions activer)
FEATURES = {
    "voice_report": "app/ai/voice_report.py",
    "rag_assistant": "app/ai/rag_assistant.py",
    "pharmacovigilance": "app/ai/pharmacovigilance.py",
    "card_scanner": "app/ai/card_scanner.py",
    "recommendations": "app/ai/recommendations.py",
}
