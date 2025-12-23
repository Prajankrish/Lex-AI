# backend/build_index/rag.py
import os
import json
import pickle
from sentence_transformers import SentenceTransformer
import faiss

# ------------------------------
# Config
# ------------------------------
DATA_FILE = "formatted_ipc_chat.jsonl"
INDEX_FILE = "../ipc_data.pkl"  # save into backend root
EMBEDDING_MODEL = "all-MiniLM-L6-v2"

# ------------------------------
# Load dataset
# ------------------------------
def load_dataset(file_path=DATA_FILE):
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"{file_path} not found!")

    with open(file_path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    # Separate docs and queries
    docs = [json.loads(line)["content"] for line in lines if json.loads(line)["role"] == "assistant"]
    queries = [json.loads(line)["content"] for line in lines if json.loads(line)["role"] == "user"]

    return docs, queries

# ------------------------------
# Build FAISS index
# ------------------------------
def build_faiss_index(docs, model):
    embeddings = model.encode(docs)
    dim = embeddings.shape[1]
    index = faiss.IndexFlatL2(dim)
    index.add(embeddings)
    return index

# ------------------------------
# Save data
# ------------------------------
def save_index(model, index, docs, queries, file_path=INDEX_FILE):
    with open(file_path, "wb") as f:
        pickle.dump({
            "model": None,  # avoid serializing model object itself
            "index": index,
            "docs": docs,
            "queries": queries
        }, f)
    print(f"RAG index saved to {file_path} ✅")

# ------------------------------
# Main
# ------------------------------
def main():
    print("Loading dataset...")
    docs, queries = load_dataset()

    print("Loading embedding model...")
    model = SentenceTransformer(EMBEDDING_MODEL)

    print("Building FAISS index...")
    index = build_faiss_index(docs, model)

    print("Saving index...")
    save_index(model, index, docs, queries)
    print("RAG Index created successfully ✅")

# ------------------------------
# Execute
# ------------------------------
if __name__ == "__main__":
    main()
