"""
Medical RAG service for the PRISM AI Healthcare Assistant.

Pipeline:
  medical_kb/*.pdf  →  PyPDF2 text extraction  →  RecursiveCharacterTextSplitter
  →  ChromaDB persistent vectorstore (dense embeddings)
  →  hybrid retrieval (dense Chroma + BM25 sparse, Reciprocal Rank Fusion)
  →  LLM answer with evidence, sources, confidence, and a medical disclaimer.

Every response is explainable: it carries the retrieved chunks, source
documents, PDF page numbers, and a fused confidence score — never a
black-box answer (AGENTS.md: "Every ML output must ship with a
human-readable explanation").

A hard crisis gate (shared with the companion engine) runs BEFORE any LLM
call, per SCOPE.md: "all conversation streams pass through an un-bypassable
crisis filter before LLM routing".
"""
import glob
import logging
import os
import re

from app.config import settings
from app.utils.companion_engine import check_crisis, CRISIS_RESPONSE
from app.utils.llm_provider import (
    get_embeddings,
    get_llm,
    MEDICAL_DISCLAIMER,
    rag_available,
)

logger = logging.getLogger(__name__)

MEDICAL_SYSTEM_PROMPT = (
    "You are the PRISM Medical Health Assistant, a careful consumer-health "
    "information assistant for guardians. Answer questions about symptoms, "
    "conditions, medication basics, lifestyle, diet, exercise, stress, "
    "first aid, and when to see a doctor.\n"
    "Rules:\n"
    "- Base your answer ONLY on the provided evidence chunks. If the evidence "
    "does not cover the question, say so plainly.\n"
    "- You are NOT a doctor and never give a diagnosis. Use careful, "
    "non-diagnostic language; never use diagnostic labels as conclusions.\n"
    "- Distinguish urgent situations: if symptoms suggest an emergency "
    "(chest pain, trouble breathing, severe bleeding, etc.), say to seek "
    "emergency care immediately.\n"
    "- Keep answers plain, structured, and under ~250 words.\n"
    "- Never invent citations: only reference the sources provided.\n"
)

# Cache so we only load/embed the KB once per process.
_vectorstore = None
_documents = None
_bm25_index = None


# ─── Document loading ───────────────────────────────────────────────────────


def kb_stats() -> dict:
    """Return {docs, chunks, vector_ready} for the status endpoint."""
    pdfs = glob.glob(os.path.join(settings.MEDICAL_KB_DIR, "*.pdf"))
    txts = glob.glob(os.path.join(settings.MEDICAL_KB_DIR, "*.txt"))
    chunks = 0
    if _documents is not None:
        chunks = len(_documents)
    return {
        "docs": len(pdfs) + len(txts),
        "chunks": chunks,
        "vector_ready": _vectorstore is not None,
    }


def _reset_cache():
    global _vectorstore, _documents, _bm25_index
    _vectorstore = None
    _documents = None
    _bm25_index = None


def load_medical_documents() -> list:
    """
    Loads every PDF (.pdf via PyPDF2) and plain-text (.txt) file under
    MEDICAL_KB_DIR, and splits into overlapping chunks with per-chunk source
    + page metadata. Plain text is a self-contained fallback so the demo KB
    works even before the optional PDF deps are installed.
    Returns a list of LangChain Documents (or [] if nothing usable).
    """
    if not rag_available():
        logger.warning("RAG dependencies not installed; medical KB unavailable.")
        return []

    from langchain_text_splitters import RecursiveCharacterTextSplitter

    global _documents
    if _documents is not None:
        return _documents

    raw_pages = []  # (text, source, page)

    # 1) PDFs (requires pypdf)
    pdf_paths = sorted(glob.glob(os.path.join(settings.MEDICAL_KB_DIR, "*.pdf")))
    try:
        from pypdf import PdfReader

        for path in pdf_paths:
            try:
                reader = PdfReader(path)
                source = os.path.basename(path)
                for page_idx, page in enumerate(reader.pages, start=1):
                    text = (page.extract_text() or "").strip()
                    if len(text) >= 40:
                        raw_pages.append((text, source, page_idx))
            except Exception as e:
                logger.warning("Failed to read PDF %s: %s", path, str(e))
    except ImportError:
        logger.warning("pypdf not installed; skipping PDF ingestion.")

    # 2) Plain-text fact sheets (self-contained demo corpus)
    txt_paths = sorted(glob.glob(os.path.join(settings.MEDICAL_KB_DIR, "*.txt")))
    for path in txt_paths:
        try:
            with open(path, "r", encoding="utf-8") as fh:
                text = fh.read().strip()
            if len(text) >= 40:
                raw_pages.append((text, os.path.basename(path), 1))
        except Exception as e:
            logger.warning("Failed to read text KB %s: %s", path, str(e))

    if not raw_pages:
        logger.warning("No usable medical KB content found in %s", settings.MEDICAL_KB_DIR)
        _documents = []
        return _documents

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000, chunk_overlap=150, separators=["\n\n", "\n", ". ", " "]
    )
    split_docs = []
    for text, source, page in raw_pages:
        for chunk in splitter.split_text(text):
            split_docs.append(
                {"page_content": chunk, "metadata": {"source": source, "page": page}}
            )
    _documents = split_docs
    logger.info(
        "Medical KB loaded: %d chunks from %d files", len(split_docs), len(raw_pages)
    )
    return _documents


# ─── Vectorstore ────────────────────────────────────────────────────────────


def build_or_get_vectorstore():
    """
    Builds (once) a persistent Chroma collection from the KB documents.
    Returns the Chroma collection, or None if unavailable/empty.
    """
    global _vectorstore
    if _vectorstore is not None:
        return _vectorstore

    docs = load_medical_documents()
    if not docs:
        return None

    try:
        import chromadb

        embeddings = get_embeddings()
        client = chromadb.PersistentClient(path=settings.CHROMA_PERSIST_DIR)
        collection = client.get_or_create_collection(
            name=settings.CHROMA_COLLECTION,
            metadata={"hnsw:space": "cosine"},
        )
        if collection.count() == 0:
            ids = [f"chunk-{i}" for i in range(len(docs))]
            collection.add(
                ids=ids,
                documents=[d["page_content"] for d in docs],
                metadatas=[d["metadata"] for d in docs],
                embeddings=embeddings.embed_documents([d["page_content"] for d in docs]),
            )
            logger.info("Embedded %d chunks into Chroma collection", len(docs))
        _vectorstore = collection
        return collection
    except Exception as e:
        logger.error("Failed to build Chroma vectorstore: %s", str(e))
        return None


# ─── Hybrid retrieval (dense + BM25 → RRF) ──────────────────────────────────


def _tokenize(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", text.lower())


def _get_bm25():
    """Lazy-build a BM25 index over the loaded chunks."""
    global _bm25_index
    if _bm25_index is not None:
        return _bm25_index
    docs = load_medical_documents()
    if not docs:
        return None
    try:
        from rank_bm25 import BM25Okapi

        tokenized = [_tokenize(d["page_content"]) for d in docs]
        _bm25_index = BM25Okapi(tokenized)
        return _bm25_index
    except Exception as e:
        logger.warning("BM25 unavailable: %s", str(e))
        return None


def hybrid_search(query: str, k: int = 5) -> list[dict]:
    """
    Dense (Chroma) + sparse (BM25) retrieval fused via Reciprocal Rank Fusion.
    Returns [{chunk, source, page, score}] sorted by fused relevance.
    """
    docs = load_medical_documents()
    if not docs:
        return []

    collection = build_or_get_vectorstore()
    bm25 = _get_bm25()

    dense_hits: list[dict] = []
    if collection is not None:
        try:
            emb = get_embeddings().embed_query(query)
            res = collection.query(
                query_embeddings=[emb], n_results=min(k, max(len(docs), 1))
            )
            for i, doc in enumerate(res.get("documents", [[]])[0]):
                meta = res.get("metadatas", [[]])[0][i]
                dist = res.get("distances", [[]])[0][i]
                dense_hits.append(
                    {
                        "chunk": doc,
                        "source": meta.get("source", "unknown"),
                        "page": meta.get("page", 0),
                        "dense_score": float(1.0 - dist),
                    }
                )
        except Exception as e:
            logger.warning("Dense retrieval failed: %s", str(e))

    sparse_hits: list[dict] = []
    if bm25 is not None:
        try:
            scores = bm25.get_scores(_tokenize(query))
            ranked = sorted(
                range(len(scores)), key=lambda i: scores[i], reverse=True
            )[:k]
            for idx in ranked:
                if scores[idx] <= 0:
                    continue
                sparse_hits.append(
                    {
                        "chunk": docs[idx]["page_content"],
                        "source": docs[idx]["metadata"]["source"],
                        "page": docs[idx]["metadata"]["page"],
                        "bm25_score": float(scores[idx]),
                    }
                )
        except Exception as e:
            logger.warning("Sparse retrieval failed: %s", str(e))

    # Reciprocal Rank Fusion
    fused: dict[int, dict] = {}
    for i, hit in enumerate(dense_hits):
        rank = i + 1
        key = (hit["source"], hit["page"], hit["chunk"][:80])
        entry = fused.setdefault(
            key,
            {"chunk": hit["chunk"], "source": hit["source"], "page": hit["page"], "rrf": 0.0},
        )
        entry["rrf"] += 1.0 / (60 + rank)
    for i, hit in enumerate(sparse_hits):
        rank = i + 1
        key = (hit["source"], hit["page"], hit["chunk"][:80])
        entry = fused.setdefault(
            key,
            {"chunk": hit["chunk"], "source": hit["source"], "page": hit["page"], "rrf": 0.0},
        )
        entry["rrf"] += 1.0 / (60 + rank)

    results = sorted(fused.values(), key=lambda x: x["rrf"], reverse=True)[:k]
    max_rrf = max((r["rrf"] for r in results), default=1.0)
    for r in results:
        # Normalize RRF to a 0..1 confidence proxy
        r["score"] = round(r["rrf"] / max_rrf, 3) if max_rrf > 0 else 0.0
    return results


# ─── Query ──────────────────────────────────────────────────────────────────


def medical_query(query: str, history: list[dict] | None = None) -> dict:
    """
    Answers a medical question with evidence. Runs the crisis gate first.
    Returns a dict with answer/evidence/sources/confidence/disclaimer/crisis.

    If the RAG stack is unavailable (deps missing, no KB, LLM error), returns
    a graceful fallback explaining the limitation instead of crashing.
    """
    # Un-bypassable crisis gate (SCOPE.md): before any LLM routing.
    if check_crisis(query):
        return {
            "answer": CRISIS_RESPONSE,
            "evidence": [],
            "sources": [],
            "confidence": 1.0,
            "disclaimer": MEDICAL_DISCLAIMER,
            "crisis": True,
        }

    retrieval = hybrid_search(query, k=5)
    if not retrieval:
        return {
            "answer": (
                "I'm sorry — the medical knowledge base isn't available yet. "
                "A guardian administrator needs to ingest the medical PDFs "
                "before I can answer health questions. "
            ) + MEDICAL_DISCLAIMER,
            "evidence": [],
            "sources": [],
            "confidence": 0.0,
            "disclaimer": MEDICAL_DISCLAIMER,
            "crisis": False,
        }

    context = "\n\n".join(
        f"[Source: {r['source']} p.{r['page']}]\n{r['chunk']}" for r in retrieval
    )

    try:
        llm = get_llm()
        from langchain_core.messages import HumanMessage, SystemMessage

        messages = [SystemMessage(content=MEDICAL_SYSTEM_PROMPT)]
        if history:
            for turn in history[-settings.CHAT_HISTORY_LIMIT:]:
                role = turn.get("role", "user")
                content = str(turn.get("utterance", ""))
                messages.append(
                    HumanMessage(content=content)
                    if role == "user"
                    else SystemMessage(content=f"[previous assistant reply] {content}")
                )
        messages.append(
            HumanMessage(
                content=(
                    f"Question from a guardian:\n{query}\n\n"
                    f"Evidence:\n{context}\n\n"
                    "Answer using only the evidence above. "
                    "If it doesn't cover the question, say so."
                )
            )
        )
        response = llm.invoke(messages)
        answer = str(response.content).strip()
    except Exception as e:
        logger.warning("LLM call failed (%s); returning retrieval-only answer", str(e))
        answer = (
            "I found relevant information in the medical library, but the "
            "language model is temporarily unavailable. Here is the source "
            "material to review:\n\n" + context[:2000]
        )

    confidence = round(sum(r["score"] for r in retrieval) / len(retrieval), 2)
    return {
        "answer": answer,
        "evidence": [
            {
                "source": r["source"],
                "page": r["page"],
                "chunk": r["chunk"],
                "score": r["score"],
            }
            for r in retrieval
        ],
        "sources": [f"{r['source']}#page={r['page']}" for r in retrieval],
        "confidence": confidence,
        "disclaimer": MEDICAL_DISCLAIMER,
        "crisis": False,
    }


def rebuild_kb() -> dict:
    """Re-scan MEDICAL_KB_DIR and rebuild the vectorstore. Admin endpoint."""
    _reset_cache()
    build_or_get_vectorstore()
    return kb_stats()
