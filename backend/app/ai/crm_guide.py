"""
╔══════════════════════════════════════════════════════════════════════╗
║  IA n°2 (suite) — ASSISTANT NOOR : « MODE D'EMPLOI DU CRM »          ║
║  Statut : implémenté (recherche + réponse extraite ; Claude facultatif) ║
╚══════════════════════════════════════════════════════════════════════╝

Objectif
    Répondre aux questions sur le fonctionnement de l'application (« Comment planifier
    une visite ? », « Où voir mon CPA ? », « Comment est calculée la couverture ? »)
    à partir d'un guide écrit d'après les vrais écrans : docs/guide/guide_noor.md.

Même méthode que l'assistant produit (rag_assistant.py)
    Une section « ## n. Titre » du guide = un passage citable ; recherche BM25 ;
    réponse recopiée du guide (ou rédigée par Claude à partir des seuls passages trouvés),
    toujours avec la section citée. Si le guide ne parle pas de la question : refus.
"""
import re
from functools import lru_cache
from pathlib import Path

from sqlalchemy.orm import Session

from app.ai import llm
from app.ai.pharmacovigilance import normalize
from app.ai.rag_assistant import Passage, _best_sentences, _bm25, tokenize
from app.ai.schemas import AskRequest, AskResponse, Citation

GUIDE_FILE = Path(__file__).resolve().parents[3] / "docs" / "guide" / "guide_noor.md"
GUIDE_TITLE = "Guide d'utilisation NOOR"

# Mots qui montrent qu'on parle de l'application (et pas d'un médicament)
CRM_WORDS = re.compile(
    r"\b(crm|noor|application|appli|page|ecran|bouton|menu|onglet|tableau de bord|planning|agenda|compte.?rendu|"
    r"fiche|filtre|alerte|evenement|conge|formation|reunion|statistiques?|objectifs?|cpa|couverture|ciblage|"
    r"segment|f1|f2|territoire|ventes?|part de marche|indice|dictee|dicter|micro|carte|superviseur|equipe|delegue|"
    r"medecins?|visites?|connexion|connecter|mot de passe|assistant|pharmacovigilance|declar)"
)


# Verbes trop courants dans les questions « mode d'emploi » pour aider la recherche
# (« posologie » vient du synonyme « combien » des RCP : inutile pour le guide)
GUIDE_STOPWORDS = {"voir", "trouver", "ouvrir", "afficher", "faire", "cliquer", "aller", "acceder", "consulter",
                   "posologie"}
# Synonymes propres au guide : « créer un médecin » = « ajouter un médecin »
GUIDE_SYNONYMS = {"creer": "ajouter", "nouveau": "ajouter", "nouvelle": "ajouter", "enregistrer": "ajouter",
                  "rajouter": "ajouter", "editer": "modifier", "changer": "modifier", "corriger": "modifier"}


def guide_tokens(text: str) -> list[str]:
    tokens = (GUIDE_SYNONYMS.get(t, t) for t in tokenize(text))
    return [t for t in tokens if t not in GUIDE_STOPWORDS]


@lru_cache(maxsize=1)
def load_passages() -> tuple[Passage, ...]:
    """Lit le guide et le découpe en sections (gardé en mémoire)."""
    text = GUIDE_FILE.read_text(encoding="utf-8")
    return tuple(
        Passage("Guide", int(m[1]), m[2].strip(), m[3].strip(), guide_tokens(f"{m[2]} {m[2]} {m[3]}"))
        for m in re.finditer(r"^## (\d+)\. (.+?)\n\n(.+?)(?=\n## |\Z)", text, re.S | re.M)
    )


def mentions_crm(question: str) -> bool:
    return bool(CRM_WORDS.search(normalize(question)))


MIN_SCORE = 1.2
DEFINITION = re.compile(r"c.?est quoi|qu.?est.?ce qu|que (signifie|veut dire)|definition|veut dire")

REFUSAL = (
    "Je ne trouve pas cette information dans le guide d'utilisation de NOOR. "
    "Reformulez la question, ou demandez à votre superviseur."
)


def _cite(p: Passage, excerpt: str) -> Citation:
    return Citation(document_id=0, document_title=GUIDE_TITLE, page=p.section_no, section=p.section_title, excerpt=excerpt)


def answer(db: Session, request: AskRequest) -> AskResponse:
    """Répond à une question « mode d'emploi » à partir du guide, avec la section citée."""
    query = guide_tokens(request.question)
    corpus = load_passages()
    # Bonus quand les mots de la question sont dans le titre de la section :
    # « ajouter un médecin » doit trouver « Ajouter ou modifier un médecin », pas « Ajouter un événement »
    ranked = sorted(((s + 0.5 * len(set(query) & set(guide_tokens(p.section_title))), p)
                     for s, p in _bm25(query, list(corpus), corpus) if s > 0), key=lambda x: -x[0])
    # « C'est quoi un F2 ? », « Que signifie DSM ? » : on privilégie la section Vocabulaire
    if DEFINITION.search(normalize(request.question)):
        ranked = sorted(((s * 1.5 if p.section_title.startswith("Vocabulaire") else s, p) for s, p in ranked),
                        key=lambda x: -x[0])
    # Seuil plus bas que pour les RCP : le guide est court, ses mots-clés reviennent souvent
    if not query or not ranked or ranked[0][0] < MIN_SCORE:
        return AskResponse(answer=REFUSAL, citations=[], refused=True, kind="guide")

    top = [p for _, p in ranked[:4]]
    with_claude = _answer_with_claude(request.question, top)
    if with_claude is not None:
        return with_claude

    # Sans Claude : on recopie les phrases les plus utiles de la meilleure section
    best = ranked[0][1]
    excerpt = _best_sentences(best, query, count=3)
    return AskResponse(answer=f"D'après le guide NOOR, section « {best.section_title} » : {excerpt}",
                       citations=[_cite(best, excerpt)], kind="guide")


def _answer_with_claude(question: str, passages: list[Passage]) -> AskResponse | None:
    numbered = "\n\n".join(f"[P{i}] Guide NOOR, section {p.section_no} « {p.section_title} » :\n{p.text}"
                           for i, p in enumerate(passages, start=1))
    result = llm.ask_json(
        system=(
            "Tu es l'assistant du CRM pharmaceutique NOOR. Tu expliques aux délégués médicaux comment utiliser "
            "l'application, UNIQUEMENT à partir des passages du guide d'utilisation fournis. N'invente aucun bouton "
            "ni aucune page. Si les passages ne permettent pas de répondre, mets refused à true. Réponds en français, "
            "en 1 à 4 phrases simples (étapes dans l'ordre), et indique les passages utilisés."
        ),
        prompt=f"Passages :\n\n{numbered}\n\nQuestion : {question}",
        schema=llm.strict_object({
            "answer": {"type": "string"},
            "refused": {"type": "boolean"},
            "used_passages": {"type": "array", "items": {"type": "integer"}},
        }),
    )
    if result is None:
        return None
    if result["refused"]:
        return AskResponse(answer=REFUSAL, citations=[], refused=True, kind="guide")
    used = [passages[i - 1] for i in dict.fromkeys(result["used_passages"]) if 1 <= i <= len(passages)]
    if not used:
        return None
    return AskResponse(answer=result["answer"], citations=[_cite(p, p.text) for p in used], kind="guide")
