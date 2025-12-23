# backend/loader.py
import os
import pickle
from functools import lru_cache
from typing import Tuple

IPC_PKL = os.getenv("IPC_PKL", "ipc_data.pkl")
EMBED_MODEL = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")

@lru_cache(maxsize=1)
def load_model_data() -> Tuple[object, object, list]:
    """
    Lazily load sentence-transformer model and FAISS index/docs.
    Import heavy libraries inside the function to avoid import-time crashes.
    Returns: (model, index, docs)
    """
    try:
        # Import lazily to avoid top-level import errors during app startup
        from sentence_transformers import SentenceTransformer
    except Exception as e:
        # Provide a friendly error message with actionable pip commands
        raise ImportError(
            "Failed to import sentence-transformers. "
            "Install compatible packages inside your virtualenv with:\n\n"
            "  pip install --upgrade sentence-transformers transformers\n"
            "  pip install 'huggingface_hub>=0.16.4,<0.18'\n\n"
            f"Underlying error: {e}"
        ) from e

    # Instantiate model
    model = SentenceTransformer(EMBED_MODEL)

    # Load index and docs
    if not os.path.exists(IPC_PKL):
        raise FileNotFoundError(f"{IPC_PKL} not found. Run build_index/rag.py first.")
    with open(IPC_PKL, "rb") as f:
        data = pickle.load(f)
        index = data["index"]
        docs = data["docs"]
    return model, index, docs
