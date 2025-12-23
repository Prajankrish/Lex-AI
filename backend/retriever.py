# backend/retriever.py

from typing import List, Optional, Any
import logging
import time
import numpy as np
from collections import OrderedDict

logger = logging.getLogger(__name__)

# Simple in-memory LRU cache for query embeddings to speed repeated queries
_EMBED_CACHE_MAX = 512
_embed_cache = OrderedDict()

def _get_cached_embedding(query: str):
    # Return cached embedding or None
    v = _embed_cache.get(query)
    if v is not None:
        # move to end = most recently used
        _embed_cache.move_to_end(query)
    return v

def _set_cached_embedding(query: str, emb):
    _embed_cache[query] = emb
    _embed_cache.move_to_end(query)
    if len(_embed_cache) > _EMBED_CACHE_MAX:
        _embed_cache.popitem(last=False)

def _fallback_text_search(query: str, docs: List[str], top_k: int = 3) -> List[str]:
    """
    Very simple fallback ranking: score docs by occurrences of query tokens.
    Not semantic, but robust if embeddings/index are not present.
    """
    if not docs:
        return []

    q_tokens = [t.lower() for t in query.split() if t.strip()]
    scores = []
    for i, d in enumerate(docs):
        text = d.lower()
        # count token matches, plus small boost for exact substring
        score = sum(text.count(tok) for tok in q_tokens)
        if query.lower().strip() in text:
            score += 3
        # slightly reward shorter docs that match (heuristic)
        score = score + (0 if len(text) > 1000 else 0.1)
        scores.append((score, i))

    # sort descending by score
    scores.sort(key=lambda x: x[0], reverse=True)
    top_indices = [idx for sc, idx in scores if sc > 0][:top_k]
    # if no positive matches, return first top_k docs as fallback
    if not top_indices:
        top_indices = list(range(min(len(docs), top_k)))
    return [docs[i] for i in top_indices]


def retrieve_relevant_docs(query: str,
                           model: Optional[Any] = None,
                           index: Optional[Any] = None,
                           docs: Optional[List[str]] = None,
                           top_k: int = 2) -> List[str]:
    """
    Retrieve relevant documents for `query`.

    Preferred path (if model & index provided):
      - encode query with model (supports sentence-transformers API)
      - search index (FAISS Index) and return top_k docs

    Fallback path:
      - if index/model missing or search fails, use simple text-token scoring on `docs`.

    Args:
      query: user query string
      model: embedding model (e.g., SentenceTransformer instance) or None
      index: FAISS index or similar, or None
      docs: list of doc strings aligned with index (required for fallback)
      top_k: number of results to return

    Returns:
      list[str] length <= top_k
    """
    if not query:
        return []

    start_ts = time.time()

    # Use FAISS + model if available
    try:
        if index is not None and model is not None and docs is not None:
            # Many sentence-transformers models accept model.encode(list_of_texts)
            # If model has .encode, use that
            # Try to reuse cached embedding for identical queries
            q_emb = _get_cached_embedding(query)
            if q_emb is None:
                if hasattr(model, "encode"):
                    # Make sure query embedding shape is correct
                    q_emb = model.encode([query])
                else:
                    # Fallback: try calling model(query)
                    q_emb = model([query])
                # Ensure numpy array
                if hasattr(q_emb, "tolist"):
                    q_emb = np.array(q_emb)
                # Cache the embedding for future queries
                try:
                    _set_cached_embedding(query, q_emb)
                except Exception:
                    pass
            # Some FAISS indexes expect float32
            try:
                q_emb = q_emb.astype("float32")
            except Exception:
                pass

            # Do the search (IndexFlat, IndexIVF, etc.)
            D, I = index.search(q_emb, top_k)
            # I shape: (1, k)
            indices = []
            if hasattr(I, "__iter__"):
                # handle None or -1
                first_row = I[0] if isinstance(I[0], (list, tuple, np.ndarray)) else I
                for idx in first_row:
                    if idx is None or (isinstance(idx, (int, np.integer)) and idx < 0):
                        continue
                    indices.append(int(idx))
            # Map to docs
            results = []
            for idx in indices:
                try:
                    results.append(docs[idx])
                except Exception:
                    continue
            # If no results (rare), fallback to text search
            if results:
                duration = time.time() - start_ts
                logger.info("retriever: faiss returned %d results in %.3fs (top_k=%d)", len(results), duration, top_k)
                return results[:top_k]
            else:
                logger.debug("FAISS returned no results; falling back to text scoring.")
    except Exception as e:
        logger.exception("Embedding/index retrieval path failed: %s. Falling back to text search.", e)

    # Fallback: simple text scoring on docs
    try:
        results = _fallback_text_search(query, docs or [], top_k=top_k)
        duration = time.time() - start_ts
        logger.info("retriever: fallback returned %d results in %.3fs (top_k=%d)", len(results), duration, top_k)
        return results
    except Exception as e:
        logger.exception("Fallback text search failed: %s", e)
        return []
