"""
Accès (facultatif) au modèle de langage Claude, partagé par les modules IA.

Principe : chaque module IA fonctionne SANS clé d'API, avec des règles simples
(mots-clés, recherche de texte...). Si la variable d'environnement
ANTHROPIC_API_KEY est définie, les modules demandent en plus à Claude un résultat
de meilleure qualité. En cas d'erreur (réseau, quota, refus...), ils reviennent
aux règles : la démo ne tombe jamais en panne.

Pour activer Claude :
    - en local (PowerShell) :  $env:ANTHROPIC_API_KEY = "sk-ant-..."  puis relancer l'API ;
    - en ligne (Render)     :  Environment → Add Environment Variable → ANTHROPIC_API_KEY.
La clé ne doit JAMAIS être écrite dans le code ni envoyée sur GitHub.
"""
import json
import logging
import os

log = logging.getLogger("uvicorn.error")

# Modèle utilisé (le plus récent de la gamme Opus)
MODEL = "claude-opus-5-5"


def is_available() -> bool:
    """True si une clé d'API est configurée et le paquet `anthropic` installé."""
    if not os.environ.get("ANTHROPIC_API_KEY"):
        return False
    try:
        import anthropic  # noqa: F401
    except ImportError:
        return False
    return True


def ask_json(system: str, prompt: str, schema: dict, max_tokens: int = 4000) -> dict | None:
    """
    Pose une question à Claude et récupère une réponse JSON qui respecte `schema`
    (sorties structurées : le format est garanti par l'API).

    Renvoie None si Claude n'est pas disponible ou en cas de problème :
    l'appelant utilise alors sa méthode sans IA générative.
    """
    if not is_available():
        return None
    import anthropic  # import local : le backend démarre même sans ce paquet

    try:
        client = anthropic.Anthropic()
        response = client.beta.messages.create(
            model=MODEL,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": prompt}],
            # Effort « low » : tâches courtes d'extraction / classification
            output_config={"effort": "low", "format": {"type": "json_schema", "schema": schema}},
            # Si le modèle refuse (filtres de sécurité), l'API réessaie sur un autre modèle
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )
    except anthropic.APIError as exc:
        log.warning("Claude indisponible (%s) : on utilise les règles sans IA générative.", exc)
        return None

    if response.stop_reason == "refusal":
        log.warning("Claude a refusé la demande : on utilise les règles sans IA générative.")
        return None
    text = next((block.text for block in response.content if block.type == "text"), None)
    if not text:
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        log.warning("Réponse de Claude illisible : on utilise les règles sans IA générative.")
        return None


def strict_object(properties: dict, required: list[str] | None = None) -> dict:
    """Petit utilitaire : schéma JSON d'un objet (tous les champs requis, aucun champ en plus)."""
    return {
        "type": "object",
        "properties": properties,
        "required": required if required is not None else list(properties),
        "additionalProperties": False,
    }
