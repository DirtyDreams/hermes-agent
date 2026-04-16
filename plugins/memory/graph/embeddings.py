"""EmbeddingCache — semantic embedding support for the graph memory plugin.

Uses sentence-transformers when available, falling back gracefully to a
TF-IDF-style keyword similarity so the rest of the plugin always works.

The cache persists embeddings to disk (JSON) to avoid re-computing them on
every agent restart.
"""

from __future__ import annotations

import json
import logging
import math
import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# Dimension of the hash-bucketed bag-of-words fallback vector.
# 256 buckets give sufficient resolution for typical vocabulary sizes while
# keeping memory usage low (one float per bucket, shared across documents).
_KEYWORD_VECTOR_DIM = 256

# ---------------------------------------------------------------------------
# Backend detection
# ---------------------------------------------------------------------------

try:
    from sentence_transformers import SentenceTransformer  # type: ignore
    _ST_AVAILABLE = True
except ImportError:
    _ST_AVAILABLE = False

# ---------------------------------------------------------------------------
# EmbeddingCache
# ---------------------------------------------------------------------------


class EmbeddingCache:
    """Disk-persisted embedding cache with semantic or keyword search.

    When sentence-transformers is available:
      - Uses the configured model to embed text into a dense vector.
      - Cosine similarity drives ranking.

    When unavailable:
      - Falls back to a bag-of-words TF-IDF-style similarity.
      - Results are still useful for simple retrieval; just less semantic.
    """

    DEFAULT_MODEL = "sentence-transformers/all-MiniLM-L6-v2"

    def __init__(
        self,
        cache_path: Optional[Path] = None,
        model_name: str = DEFAULT_MODEL,
    ) -> None:
        self._cache_path = cache_path
        self._model_name = model_name
        self._model: Any = None
        self._cache: Dict[str, List[float]] = {}
        self._backend = "keyword"

        if _ST_AVAILABLE:
            self._try_load_model()

        self._load_cache()

    @property
    def backend(self) -> str:
        return self._backend

    # ------------------------------------------------------------------
    # Model loading
    # ------------------------------------------------------------------

    def _try_load_model(self) -> None:
        try:
            self._model = SentenceTransformer(self._model_name)
            self._backend = "sentence-transformers"
            logger.debug("EmbeddingCache: loaded model '%s'", self._model_name)
        except Exception as exc:
            logger.debug(
                "EmbeddingCache: failed to load sentence-transformers model '%s': %s "
                "— falling back to keyword similarity.",
                self._model_name,
                exc,
            )
            self._backend = "keyword"

    # ------------------------------------------------------------------
    # Cache persistence
    # ------------------------------------------------------------------

    def _load_cache(self) -> None:
        if self._cache_path and self._cache_path.exists():
            try:
                raw = json.loads(self._cache_path.read_text(encoding="utf-8"))
                self._cache = raw.get("embeddings", {})
            except Exception as exc:
                logger.debug("EmbeddingCache: could not load cache: %s", exc)

    def _save_cache(self) -> None:
        if not self._cache_path:
            return
        try:
            self._cache_path.parent.mkdir(parents=True, exist_ok=True)
            self._cache_path.write_text(
                json.dumps({"embeddings": self._cache}, ensure_ascii=False),
                encoding="utf-8",
            )
        except Exception as exc:
            logger.debug("EmbeddingCache: could not save cache: %s", exc)

    # ------------------------------------------------------------------
    # Embedding
    # ------------------------------------------------------------------

    def embed(self, text: str) -> List[float]:
        """Return (or compute + cache) an embedding for *text*."""
        key = text.strip()
        if not key:
            return []

        if key in self._cache:
            return self._cache[key]

        if self._backend == "sentence-transformers" and self._model is not None:
            try:
                vec = self._model.encode(key, show_progress_bar=False).tolist()
                self._cache[key] = vec
                self._save_cache()
                return vec
            except Exception as exc:
                logger.debug("EmbeddingCache: encode failed: %s", exc)

        # Fallback: keyword bag-of-words vector (no caching needed, it's cheap)
        return self._keyword_vector(key)

    # ------------------------------------------------------------------
    # Similarity search
    # ------------------------------------------------------------------

    def search(
        self,
        query: str,
        candidates: List[str],
        top_k: int = 5,
    ) -> List[Tuple[float, str]]:
        """Return top-k (score, text) pairs from *candidates* for *query*.

        Scores are in [0, 1] — higher is more similar.
        """
        if not candidates or not query.strip():
            return []

        q_vec = self.embed(query)
        if not q_vec:
            return []

        scored: List[Tuple[float, str]] = []
        for text in candidates:
            c_vec = self.embed(text)
            if not c_vec:
                continue
            score = _cosine(q_vec, c_vec)
            scored.append((score, text))

        scored.sort(key=lambda x: x[0], reverse=True)
        return scored[:top_k]

    # ------------------------------------------------------------------
    # Fallback: keyword (bag-of-words) similarity
    # ------------------------------------------------------------------

    def _keyword_vector(self, text: str) -> List[float]:
        """Return a sparse bag-of-words vector as a plain float list."""
        # We use a vocabulary of the text's own tokens, so this is only
        # meaningful for computing similarity between two pieces of text.
        # The approach is: represent text as a term-frequency dict, and
        # serialise it as a fixed-length hash-bucketed vector (dim=256).
        dim = _KEYWORD_VECTOR_DIM
        vec = [0.0] * dim
        tokens = text.lower().split()
        total = len(tokens) or 1
        for tok in tokens:
            bucket = hash(tok) % dim
            vec[bucket] += 1.0 / total

        # L2-normalise
        norm = math.sqrt(sum(v * v for v in vec)) or 1.0
        return [v / norm for v in vec]


# ---------------------------------------------------------------------------
# Standalone helpers
# ---------------------------------------------------------------------------


def _cosine(a: List[float], b: List[float]) -> float:
    """Cosine similarity between two equal-length float lists."""
    if len(a) != len(b) or not a:
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return dot / (norm_a * norm_b)
