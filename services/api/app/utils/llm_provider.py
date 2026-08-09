"""
Config-driven LLM + embedding factory for the Medical AI Healthcare Assistant.

Supports two backends selected via settings.MEDICAL_LLM_PROVIDER:
  - "openai"  → OpenAI Chat Completions (requires OPENAI_API_KEY)
  - "ollama"  → local Ollama server (Raspberry Pi-friendly, no API key)

All LangChain imports are lazy so the app boots and existing tests stay
hermetic even when the optional RAG dependencies are not installed.
"""

import logging

from app.config import settings

logger = logging.getLogger(__name__)

MEDICAL_DISCLAIMER = (
    "This information is for general health education only and is not a "
    "substitute for professional medical advice, diagnosis, or treatment. "
    "Always seek the advice of a qualified healthcare provider with any "
    "questions you may have regarding a medical condition. In an emergency, "
    "call your local emergency number immediately."
)


def rag_available() -> bool:
    """True when the optional LangChain/chromadb deps are importable."""
    try:
        import chromadb  # noqa: F401
        import langchain_core  # noqa: F401

        return True
    except Exception:
        return False


# Module-level caches so embeddings/LLM are constructed once per process —
# the single biggest cold-start cost in the medical chatbot.
_embeddings_cache = None
_llm_cache = None


def llm_configured() -> bool:
    """
    Fast, synchronous check for whether a real LLM backend is configured.
    Returns True only when the selected provider has what it needs — no
    network attempt, so callers can skip dead LLM round-trips instantly.
    """
    provider = settings.MEDICAL_LLM_PROVIDER.lower()
    if provider == "openai":
        return bool(settings.OPENAI_API_KEY)
    if provider == "ollama":
        return bool(settings.OLLAMA_BASE_URL)
    return False


def get_llm():
    """
    Returns a LangChain chat model per settings.MEDICAL_LLM_PROVIDER.
    Raises ValueError if the selected provider is not configured.
    Cached: constructed once per process.
    """
    global _llm_cache
    if _llm_cache is not None:
        return _llm_cache

    from langchain_openai import ChatOpenAI
    from langchain_ollama import ChatOllama

    provider = settings.MEDICAL_LLM_PROVIDER.lower()
    if provider == "openai":
        if not settings.OPENAI_API_KEY:
            raise ValueError(
                "MEDICAL_LLM_PROVIDER=openai requires OPENAI_API_KEY to be set."
            )
        logger.info("Medical RAG using OpenAI model %s", settings.OPENAI_MODEL)
        _llm_cache = ChatOpenAI(
            model=settings.OPENAI_MODEL,
            api_key=settings.OPENAI_API_KEY,
            temperature=0.2,
        )
        return _llm_cache
    if provider == "ollama":
        logger.info(
            "Medical RAG using local Ollama model %s @ %s",
            settings.OLLAMA_MODEL,
            settings.OLLAMA_BASE_URL,
        )
        _llm_cache = ChatOllama(
            model=settings.OLLAMA_MODEL,
            base_url=settings.OLLAMA_BASE_URL,
            temperature=0.2,
        )
        return _llm_cache
    raise ValueError(
        f"Unknown MEDICAL_LLM_PROVIDER '{settings.MEDICAL_LLM_PROVIDER}'. "
        "Use 'openai' or 'ollama'."
    )


def get_embeddings():
    """
    Returns a local embedding model. Prefers HuggingFace sentence-transformers
    (all-MiniLM-L6-v2, free, offline); falls back to a deterministic
    SHA256-seeded projection so the pipeline still works without the model.
    Cached: constructed once per process.
    """
    global _embeddings_cache
    if _embeddings_cache is not None:
        return _embeddings_cache

    try:
        from langchain_community.embeddings import HuggingFaceEmbeddings

        logger.info("Medical RAG using embeddings model %s", settings.EMBEDDING_MODEL)
        _embeddings_cache = HuggingFaceEmbeddings(model_name=settings.EMBEDDING_MODEL)
        return _embeddings_cache
    except Exception as e:
        logger.warning(
            "sentence-transformers unavailable (%s); using hash-projection embeddings",
            str(e),
        )
        _embeddings_cache = _HashEmbeddings()
        return _embeddings_cache


class _HashEmbeddings:
    """
    Minimal deterministic embedding fallback (256-dim unit vector seeded by
    the text hash). Keeps the RAG pipeline functional without pulling the
    HuggingFace model; NOT production-grade similarity.
    """

    def embed_query(self, text: str) -> list[float]:
        return self._vec(text)

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [self._vec(t) for t in texts]

    def _vec(self, text: str) -> list[float]:
        import hashlib

        import numpy as np

        h = hashlib.sha256(text.encode("utf-8")).hexdigest()
        seed = int(h[:8], 16)
        rng = np.random.default_rng(seed)
        vec = rng.normal(0, 1, 256)
        norm = np.linalg.norm(vec)
        return (vec / norm).tolist() if norm > 0 else vec.tolist()
