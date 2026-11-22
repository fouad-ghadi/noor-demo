"""
╔══════════════════════════════════════════════════════════════════════╗
║  IA n°2 (suite) — ASSISTANT NOOR : « INFORMATIONS MÉDICALES »         ║
║  Statut : implémenté (recherche + réponse extraite ; Claude facultatif) ║
╚══════════════════════════════════════════════════════════════════════╝

Le laboratoire veut que le chatbot réponde aussi aux questions médicales générales
(« C'est quoi la CMI ? », « Différence entre Gram positif et Gram négatif ? »),
UNIQUEMENT à partir de documents validés, avec la source.

Documents : fiches docs/medical/fiche_*.md (antibiothérapie, bactériologie), rédigées par
l'équipe dans ses propres mots (les supports de formation du partenaire ne sont pas copiés).
Même méthode que l'assistant produit : une section « ## n. Titre » = un passage citable,
recherche BM25, réponse recopiée de la fiche (ou rédigée par Claude à partir des seuls
passages trouvés), toujours avec la section citée. Rien trouvé : refus explicite.
"""
import re
from functools import lru_cache
from pathlib import Path

from app.ai import llm
from app.ai.pharmacovigilance import normalize
from app.ai.rag_assistant import Passage, _best_sentences, _bm25, tokenize
from app.ai.schemas import AskRequest, AskResponse, Citation

MEDICAL_DIR = Path(__file__).resolve().parents[3] / "docs" / "medical"

# Mots qui montrent qu'on parle de médecine générale (infectiologie) et pas d'un produit ou du CRM
MEDICAL_WORDS = re.compile(
    r"\b(antibiotiques?|antibio\w*|atb|bacteri\w*|bacterie\w*|germes?|microbes?|gram|cmi|cmb|antibiogramme|"
    r"resistan\w*|spectre|penicillines?|amoxicilline|plusieurs prises|betalactamine|beta-lactamine|cephalosporine|macrolide|aminoside|"
    r"quinolone|fluoroquinolone|tetracycline|cocci|bacille|staphylocoque|streptocoque|coli|plasmide|"
    r"peptidoglycane|spores?|capsule|prelevement|hemoculture|infection|antifongique|antiviral|virus|"
    r"bactericide|bacteriostatique|temps.dependant|concentration.dependant)\b"
)


@lru_cache(maxsize=1)
def load_passages() -> tuple[Passage, ...]:
    """Lit les fiches médicales et les découpe en sections (gardé en mémoire)."""
    passages = []
    for file in sorted(MEDICAL_DIR.glob("fiche_*.md")):
        text = file.read_text(encoding="utf-8")
        title = re.search(r"^# (.+)$", text, re.M)
        name = title[1].split(":")[-1].strip().capitalize() if title else file.stem
        for m in re.finditer(r"^## (\d+)\. (.+?)\n\n(.+?)(?=\n## |\Z)", text, re.S | re.M):
            passages.append(Passage(name, int(m[1]), m[2].strip(), m[3].strip(),
                                    tokenize(f"{m[2]} {m[2]} {m[3]}")))
    return tuple(passages)


def mentions_medical(question: str) -> bool:
    return bool(MEDICAL_WORDS.search(normalize(question)))


REFUSAL = ("Je ne trouve pas cette information dans les fiches médicales validées. "
           "Je ne peux donc pas répondre : orientez la question vers le service médical du laboratoire.")


def answer(request: AskRequest) -> AskResponse:
    corpus = load_passages()
    query = tokenize(request.question)
    ranked = [(s, p) for s, p in _bm25(query, list(corpus), corpus) if s > 0]
    if not query or not ranked or ranked[0][0] < 2.0:
        return AskResponse(answer=REFUSAL, citations=[], refused=True, kind="medical")

    def cite(p: Passage, excerpt: str) -> Citation:
        return Citation(document_id=0, document_title=f"Fiche médicale : {p.brand.lower()}", page=p.section_no,
                        section=p.section_title, excerpt=excerpt)

    top = [p for _, p in ranked[:4]]
    numbered = "\n\n".join(f"[P{i}] Fiche « {p.brand} », section {p.section_no} « {p.section_title} » :\n{p.text}"
                           for i, p in enumerate(top, start=1))
    result = llm.ask_json(
        system=("Tu es l'assistant médical d'un laboratoire pharmaceutique. Tu réponds aux délégués UNIQUEMENT "
                "à partir des passages de fiches validées fournis, sans aucune information extérieure. "
                "Si les passages ne suffisent pas, mets refused à true. Réponds en français, en 1 à 3 phrases simples."),
        prompt=f"Passages :\n\n{numbered}\n\nQuestion du délégué : {request.question}",
        schema=llm.strict_object({
            "answer": {"type": "string"},
            "refused": {"type": "boolean"},
            "used_passages": {"type": "array", "items": {"type": "integer"}},
        }),
    )
    if result is not None:
        if result["refused"]:
            return AskResponse(answer=REFUSAL, citations=[], refused=True, kind="medical")
        used = [top[i - 1] for i in dict.fromkeys(result["used_passages"]) if 1 <= i <= len(top)]
        if used:
            return AskResponse(answer=result["answer"], citations=[cite(p, p.text) for p in used], kind="medical")

    kept = [p for s, p in ranked[:2] if s >= 0.6 * ranked[0][0]]
    excerpts = [(p, _best_sentences(p, query)) for p in kept]
    text = f"D'après la fiche médicale « {excerpts[0][0].brand.lower()} » : " + " ".join(ex for _, ex in excerpts)
    return AskResponse(answer=text, citations=[cite(p, ex) for p, ex in excerpts], kind="medical")
