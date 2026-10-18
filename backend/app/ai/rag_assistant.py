"""
╔══════════════════════════════════════════════════════════════════════╗
║  IA n°2 — ASSISTANT PRODUIT (RAG avec citations)                     ║
║  Statut : implémenté (recherche + réponse extraite ; Claude facultatif) ║
╚══════════════════════════════════════════════════════════════════════╝

Objectif
    Répondre aux questions des délégués sur les produits (posologie,
    contre-indications, interactions...) UNIQUEMENT à partir des documents
    validés, en citant la source. Si les documents ne permettent pas de répondre :
    le dire (refused=True). C'est une exigence réglementaire.

Documents
    Fiches RCP simplifiées : docs/products/<Produit>/rcp_<Produit>.md
    (une section « ## n. Titre » = un passage citable). Elles sont reliées aux
    documents « RCP — ... » de la base par le champ `file_path` (voir seed.py).
    Plus tard : ajouter les PDF officiels (pypdf) avec le même découpage.

Pipeline (RAG = Retrieval-Augmented Generation)
    1. Indexation : chaque section devient un passage (produit, document, n° et titre).
    2. Recherche : score BM25 (mots de la question, sans accents ni mots vides,
       avec quelques synonymes : « enceinte » → grossesse, « dose » → posologie...),
       limitée au produit cité dans la question (ou au produit de la page affichée).
    3. Réponse :
       - avec Claude (ANTHROPIC_API_KEY) : Claude rédige la réponse en n'utilisant QUE
         les passages trouvés, et indique lesquels il cite ;
       - sans clé : NOOR recopie les phrases les plus pertinentes du passage trouvé.
       Dans les deux cas, la réponse est accompagnée de ses citations.
"""
import math
import re
from collections import Counter
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai import llm
from app.ai.pharmacovigilance import normalize
from app.ai.schemas import AskRequest, AskResponse, Citation
from app.models import Document, Product, User, Visit
from app.models.enums import DocumentType

DOCS_DIR = Path(__file__).resolve().parents[3] / "docs" / "products"

# Mots trop courants pour aider la recherche
STOPWORDS = set(
    "le la les un une des de du d l a au aux et ou en pour par sur avec sans dans ce cet cette ces "
    "est sont peut peuvent on il elle ils elles je tu nous vous quel quelle quels quelles que qui quoi "
    "comment combien est-ce peut-on ne pas plus se sa son ses leur leurs mon ma mes y t il s qu chez faut "
    "donner prendre utiliser prescrire produit medicament".split()
)
# Synonymes : mots de la question → mots présents dans les RCP
SYNONYMS = {
    "dose": "posologie", "doses": "posologie", "dosage": "posologie", "combien": "posologie",
    "enceinte": "grossesse", "allaite": "allaitement", "allaitante": "allaitement",
    "secondaire": "indesirables", "secondaires": "indesirables", "tolerance": "indesirables",
    "interdit": "contre-indications", "contre-indique": "contre-indications", "contreindication": "contre-indications",
    "associer": "interactions", "association": "interactions", "melanger": "interactions",
    "bebe": "enfant", "nourrisson": "enfant", "pediatrique": "enfant", "ans": "enfant",
    "conserver": "conservation", "frigo": "refrigerateur",
}


@dataclass
class Passage:
    brand: str
    section_no: int
    section_title: str
    text: str
    tokens: list[str]


def tokenize(text: str) -> list[str]:
    """Mots normalisés (minuscules, sans accents), sans mots vides, au singulier approximatif."""
    words = re.findall(r"[a-z0-9\-]+", normalize(text))
    out = []
    for w in words:
        w = SYNONYMS.get(w, w)
        if w in STOPWORDS or (len(w) < 2 and not w.isdigit()):  # on garde les nombres (« 6 ans »)
            continue
        out.append(w[:-1] if len(w) > 4 and w.endswith(("s", "x")) else w)  # pluriel simple
    return out


@lru_cache(maxsize=1)
def _load_passages() -> tuple[Passage, ...]:
    """Lit les fiches RCP et les découpe en sections (gardé en mémoire)."""
    passages = []
    for file in sorted(DOCS_DIR.glob("*/rcp_*.md")):
        brand = file.parent.name
        for match in re.finditer(r"^## (\d+)\. (.+?)\n\n(.+?)(?=\n## |\Z)", file.read_text(encoding="utf-8"), re.S | re.M):
            no, title, text = int(match[1]), match[2].strip(), match[3].strip()
            # Le titre de section compte aussi (deux fois) pour la recherche. Le nom du produit,
            # lui, ne sert qu'à filtrer les passages (voir _target_brands), pas à les noter.
            passages.append(Passage(brand, no, title, text, tokenize(f"{title} {title} {text}")))
    return tuple(passages)


def index_documents(db: Session) -> int:
    """(Ré)indexe les documents produits. Renvoie le nombre de passages indexés."""
    _load_passages.cache_clear()
    return len(_load_passages())


def _bm25(query: list[str], pool: list[Passage]) -> list[tuple[float, Passage]]:
    """
    Score BM25 classique : récompense les mots RARES de la question présents dans le passage.
    La rareté est mesurée sur tous les documents ; on ne note que les passages de `pool`.
    """
    corpus = _load_passages()
    n = len(corpus)
    avg_len = sum(len(p.tokens) for p in corpus) / max(1, n)
    df = Counter(t for p in corpus for t in set(p.tokens))
    scored = []
    for p in pool:
        tf = Counter(p.tokens)
        score = 0.0
        for t in set(query):
            if t not in tf:
                continue
            idf = math.log(1 + (n - df[t] + 0.5) / (df[t] + 0.5))
            score += idf * tf[t] * 2.2 / (tf[t] + 1.2 * (0.25 + 0.75 * len(p.tokens) / avg_len))
        scored.append((score, p))
    return sorted(scored, key=lambda x: -x[0])


def _target_brands(db: Session, request: AskRequest) -> set[str]:
    """Produit(s) concerné(s) : cité(s) dans la question, sinon celui de la page affichée."""
    products = list(db.scalars(select(Product)))
    q = normalize(request.question)
    named = {p.brand_name for p in products if normalize(p.brand_name) in q or normalize(p.molecule.split(" ")[0]) in q}
    if named:
        return named
    ctx = request.context
    if ctx and ctx.product_id:
        return {p.brand_name for p in products if p.id == ctx.product_id}
    if ctx and ctx.visit_id:
        visit = db.get(Visit, ctx.visit_id)
        if visit and visit.products:
            return {vp.product.brand_name for vp in visit.products}
    return set()  # tous les produits


def _best_sentences(passage: Passage, query: list[str], count: int = 2) -> str:
    """
    Extrait à citer. Si la question porte sur le sujet même de la section (« contre-indications
    d'Artrinol ? ») : toute la section. Sinon : les phrases qui contiennent le plus de mots
    de la question, dans l'ordre du texte.
    """
    if set(tokenize(passage.section_title)) & set(query) and len(passage.text) <= 600:
        return passage.text
    sentences = [s for s in re.split(r"(?<=[.!?])\s+", passage.text) if s]
    ranked = sorted(range(len(sentences)), key=lambda i: -len(set(tokenize(sentences[i])) & set(query)))
    keep = sorted(i for i in ranked[:count] if set(tokenize(sentences[i])) & set(query)) or [0]
    return " ".join(sentences[i] for i in keep)


REFUSAL = (
    "Je ne trouve pas cette information dans les documents validés du laboratoire. "
    "Je ne peux donc pas répondre : orientez le médecin vers le RCP officiel ou le service médical."
)


def answer(db: Session, user: User, request: AskRequest) -> AskResponse:
    """Répond à une question à partir des documents validés, avec citations."""
    brands = _target_brands(db, request)
    # Les noms de produits servent au filtrage : on les retire des mots recherchés
    product_words = {t for p in db.scalars(select(Product)) for t in tokenize(f"{p.brand_name} {p.molecule}")}
    query = [t for t in tokenize(request.question) if t not in product_words]
    pool = [p for p in _load_passages() if not brands or p.brand in brands]
    ranked = [(s, p) for s, p in _bm25(query, pool) if s > 0]
    # Seuil : en dessous, les documents ne parlent pas vraiment de la question
    if not query or not ranked or ranked[0][0] < 2.0:
        return AskResponse(answer=REFUSAL, citations=[], refused=True)

    docs = {
        d.file_path: d
        for d in db.scalars(select(Document).where(Document.doc_type == DocumentType.RCP, Document.file_path.isnot(None)))
    }

    def cite(p: Passage, excerpt: str) -> Citation:
        doc = docs.get(f"docs/products/{p.brand}/rcp_{p.brand}.md")
        return Citation(
            document_id=doc.id if doc else 0,
            document_title=doc.title if doc else f"RCP — {p.brand}",
            page=p.section_no,
            section=p.section_title,
            excerpt=excerpt,
        )

    top = [p for _, p in ranked[:5]]
    with_claude = _answer_with_claude(request.question, top, cite)
    if with_claude is not None:
        return with_claude

    # Sans Claude : réponse extraite mot pour mot du (ou des deux) meilleur(s) passage(s)
    kept = [p for s, p in ranked[:2] if s >= 0.6 * ranked[0][0]]
    excerpts = [(p, _best_sentences(p, query)) for p in kept]
    brands_found = list(dict.fromkeys(p.brand for p, _ in excerpts))
    if len(brands_found) == 1:
        text = f"D'après le RCP {_de(brands_found[0])} : " + " ".join(ex for _, ex in excerpts)
    else:
        text = "D'après les documents validés : " + " ".join(f"pour {p.brand}, {ex}" for p, ex in excerpts)
    return AskResponse(answer=text, citations=[cite(p, ex) for p, ex in excerpts])


def _de(brand: str) -> str:
    """« de Cardiovex » mais « d'Amoxira » (élision devant une voyelle)."""
    return f"d'{brand}" if normalize(brand[0]) in "aeiouy" else f"de {brand}"


def _answer_with_claude(question: str, passages: list[Passage], cite) -> AskResponse | None:
    numbered = "\n\n".join(
        f"[P{i}] {p.brand}, RCP section {p.section_no} « {p.section_title} » :\n{p.text}"
        for i, p in enumerate(passages, start=1)
    )
    result = llm.ask_json(
        system=(
            "Tu es l'assistant produit d'un laboratoire pharmaceutique marocain. Tu réponds aux délégués "
            "médicaux UNIQUEMENT à partir des passages de documents validés fournis. N'ajoute aucune "
            "information extérieure. Si les passages ne permettent pas de répondre, mets refused à true. "
            "Réponds en français, en 1 à 3 phrases claires, et indique les passages utilisés."
        ),
        prompt=f"Passages :\n\n{numbered}\n\nQuestion du délégué : {question}",
        schema=llm.strict_object({
            "answer": {"type": "string"},
            "refused": {"type": "boolean"},
            "used_passages": {"type": "array", "items": {"type": "integer"}},
        }),
    )
    if result is None:
        return None
    if result["refused"]:
        return AskResponse(answer=REFUSAL, citations=[], refused=True)
    used = [passages[i - 1] for i in dict.fromkeys(result["used_passages"]) if 1 <= i <= len(passages)]
    if not used:
        return None  # réponse sans source : on préfère la réponse extraite, toujours sourcée
    return AskResponse(answer=result["answer"], citations=[cite(p, p.text) for p in used])
