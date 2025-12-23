# backend/llm_service.py
"""
Structured LLM service for LEXAI.

generate_legal_answer(query, retrieved_docs) -> dict:
{
  "markdown": "...",  # assistant answer as markdown
  "metadata": { ... }
}
"""
from typing import List, Dict, Any
import logging

logger = logging.getLogger(__name__)


def _extract_metadata_from_docs(retrieved_docs: List[str]) -> Dict[str, Any]:
    """
    Produces SHORT, SUMMARY-FRIENDLY metadata.
    Ensures bullets are readable and not full paragraphs.
    """

    def shorten(text: str, limit=300):
        # Delegate to the module-level sentence-aware cutter so all truncation
        # follows the same policy (prefer ending at a sentence, allow small
        # forward extension).
        return _cut_at_sentence(text, limit)


    sections: List[str] = []
    penalties: List[str] = []
    key_points: List[str] = []
    examples: List[str] = []

    for doc in retrieved_docs:
        for ln in doc.splitlines():
            ln = ln.strip()
            if not ln:
                continue

            lower = ln.lower()

            # keep short, clean bullets only
            if ("section" in lower or "ipc" in lower) and len(sections) < 3:
                sections.append(shorten(ln))

            if any(w in lower for w in ("punish", "imprison", "fine")) and len(penalties) < 3:
                penalties.append(shorten(ln))

            if any(w in lower for w in ("intent", "offence", "liable", "guilty", "element", "mens rea", "actus reus")) and len(key_points) < 4:
                key_points.append(shorten(ln))

            if ("illustration" in lower or "example" in lower) and len(examples) < 2:
                examples.append(shorten(ln))

    # Deduplicate near-identical entries across categories while preserving order.
    # Use normalized keys (lowercase, remove punctuation, collapse spaces) and
    # treat substring matches as duplicates to avoid slightly different
    # truncations appearing in multiple lists.
    import re
    seen_keys_list = []
    seen_keys_set = set()

    def _canonical(s: str) -> str:
        k = s or ""
        k = k.strip().lower()
        # Remove trailing ellipses and stray punctuation
        k = re.sub(r"\.\.\.+$", "", k)
        # Replace non-alphanumeric (keep spaces) with space
        k = re.sub(r"[^0-9a-z\s]", " ", k)
        # Collapse spaces
        k = re.sub(r"\s+", " ", k).strip()
        return k

    def _is_duplicate_key(key: str) -> bool:
        # Exact or substring containment check against previously seen keys
        if key in seen_keys_set:
            return True
        for existing in seen_keys_list:
            if not existing:
                continue
            if key in existing or existing in key:
                return True
        return False

    def _uniq_preserve(items):
        out = []
        for it in items:
            if not it or not it.strip():
                continue
            key = _canonical(it)
            if not key:
                continue
            if _is_duplicate_key(key):
                continue
            seen_keys_list.append(key)
            seen_keys_set.add(key)
            out.append(it)
        return out

    sections = _uniq_preserve(sections)
    penalties = _uniq_preserve(penalties)
    key_points = _uniq_preserve(key_points)
    examples = _uniq_preserve(examples)

    return {
        "sections": sections,
        "penalties": penalties,
        "key_points": key_points,
        "examples": examples,
    }


def _clean_text(text: str) -> str:
    """
    Lightweight cleaning: remove code fences and excessive whitespace, keep plain text.
    """
    if not text:
        return ""
    # remove code fences ```...``` and inline ```
    import re
    text = re.sub(r"```[\s\S]*?```", " ", text)
    # remove markdown headings and bullets markers
    text = re.sub(r"^#+\s*", "", text, flags=re.M)
    text = re.sub(r"^- \s*", "", text, flags=re.M)
    # remove bracketed annotations like [Repealed], [***], citations in brackets
    text = re.sub(r"\[[^\]]*\]", " ", text)
    # remove parenthetical notes (short ones)
    text = re.sub(r"\([^\)]*\)", " ", text)
    # collapse multiple whitespace
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _summarize_text(text: str, n_sentences: int = 3, max_chars: int = 600) -> str:
    """Simple extractive summarizer: return first n sentences (cleaned) up to max_chars."""
    if not text:
        return ""
    clean = _clean_text(text)
    import re
    sentences = [s.strip() for s in re.split(r'(?<=[.!?])\s+', clean) if s.strip()]
    if not sentences:
        if len(clean) <= max_chars:
            return clean
        snippet = clean[:max_chars]
        if " " in snippet:
            return snippet.rsplit(" ", 1)[0].rstrip() + "..."
        return snippet.rstrip() + "..."

    out_sentences: List[str] = []
    total = 0
    for s in sentences:
        if len(out_sentences) >= n_sentences:
            break
        # if adding this sentence would exceed max_chars, stop
        projected = total + (1 if total > 0 else 0) + len(s)
        if projected > max_chars:
            break
        out_sentences.append(s)
        total = projected

    # if we couldn't add any sentence because the first is too long, truncate the first sentence cleanly
    if not out_sentences:
        first = sentences[0]
        if len(first) <= max_chars:
            return first
        snippet = first[:max_chars]
        # try to cut at last sentence-ending char in snippet
        last_sent_end = max(snippet.rfind('.'), snippet.rfind('?'), snippet.rfind('!'))
        if last_sent_end and last_sent_end > int(max_chars * 0.3):
            return snippet[: last_sent_end + 1].strip() + "..."
        if " " in snippet:
            return snippet.rsplit(" ", 1)[0].strip() + "..."
        return snippet.strip() + "..."

    out = " ".join(out_sentences)
    # If original cleaned text is longer than our output, append ellipsis
    if len(out) < len(clean):
        return out.strip() + "..."
    return out.strip()


def _build_markdown_from_meta(query: str, meta: Dict[str, Any]) -> str:
    lines: List[str] = []

    # Short Answer / Summary (derived from assistant response)
    if meta.get("short_answer"):
        lines.append(f"### ✨ Summary\n- {meta['short_answer']}\n")

    # IPC Sections
    lines.append("### 📘 Relevant IPC Sections")
    sections = meta.get("sections", [])
    if sections:
        for s in sections:
            lines.append(f"- {s}")
    else:
        lines.append("- Not found in retrieved documents.")

    # Penalties
    lines.append("\n### ⚖️ Punishments / Penalties")
    penalties = meta.get("penalties", [])
    if penalties:
        for p in penalties:
            lines.append(f"- {p}")
    else:
        lines.append("- Not specified in the retrieved context.")

    # Key Points (numbered)
    lines.append("\n### 🧩 Key Legal Points")
    kps = meta.get("key_points", [])
    if kps:
        for i, kp in enumerate(kps, 1):
            lines.append(f"{i}. {kp}")
    else:
        lines.append("- No key points extracted.")

    # Examples
    lines.append("\n### 📚 Examples")
    examples = meta.get("examples", [])
    if examples:
        for ex in examples:
            lines.append(f"- {ex}")
    else:
        lines.append("- No examples found in the provided documents.")

    # Detailed Explanation (collapsible)
    if meta.get("detailed"):
        lines.append("\n<details>")
        lines.append("<summary>🧾 Detailed Explanation</summary>\n")
        lines.append(meta["detailed"])
        lines.append("</details>")

    return "\n".join(lines)


def _build_unified_from_meta(query: str, meta: Dict[str, Any]) -> str:
    """Return a single-section, ChatGPT-style markdown string derived from metadata.

    This consolidates summary, sections, penalties, key points and examples
    into a single coherent block to avoid repeated small cards in the UI.
    """
    parts: List[str] = []

    def _canonical(s: str) -> str:
        if not s:
            return ""
        k = s.strip().lower()
        k = re.sub(r"\.\.\.+$", "", k)
        k = re.sub(r"[^0-9a-z\s]", " ", k)
        k = re.sub(r"\s+", " ", k).strip()
        return k

    sa = meta.get("short_answer") or ""
    sa_key = _canonical(sa)
    if sa:
        parts.append(f"**Summary**\n\n{sa}")

    # Helper to filter items that duplicate or are contained within prior content
    def _filter_items(items, prior_keys):
        out = []
        for it in items:
            if not it or not str(it).strip():
                continue
            k = _canonical(str(it))
            duplicate = False
            for pk in prior_keys:
                if not pk:
                    continue
                # if item is substring of prior or vice-versa, consider duplicate
                if k in pk or pk in k:
                    duplicate = True
                    break
            if duplicate:
                continue
            out.append(str(it))
            prior_keys.append(k)
        return out

    prior = []
    if sa_key:
        prior.append(sa_key)

    sections = _filter_items(meta.get("sections", []), prior)
    if sections:
        parts.append("**Relevant IPC Sections:**\n" + "\n".join([f"- {s}" for s in sections]))

    penalties = _filter_items(meta.get("penalties", []), prior)
    if penalties:
        parts.append("**Punishments / Penalties:**\n" + "\n".join([f"- {p}" for p in penalties]))

    kps = _filter_items(meta.get("key_points", []), prior)
    if kps:
        parts.append("**Key Legal Points:**\n" + "\n".join([f"{i+1}. {kp}" for i, kp in enumerate(kps)]))

    examples = _filter_items(meta.get("examples", []), prior)
    if examples:
        parts.append("**Examples:**\n" + "\n".join([f"- {ex}" for ex in examples]))

    detailed = meta.get("detailed")
    if detailed:
        # Avoid repeating detailed if it duplicates earlier short_answer
        if not sa_key or _canonical(detailed) not in prior:
            parts.append("**Detailed Explanation:**\n" + detailed)

    if not parts:
        return "No relevant information found in retrieved documents."

    return "\n\n".join(parts)


def _fallback_generation(query: str, retrieved_docs: List[str]) -> Dict[str, Any]:
    meta = _extract_metadata_from_docs(retrieved_docs)

    # short answer heuristics: create a more informative summary from retrieved docs
    short = ""
    if retrieved_docs:
        first = retrieved_docs[0].strip()
        # split by sentence terminators (., ?, !)
        import re

        sentences = [s.strip() for s in re.split(r"[.?!]\s+", first) if s.strip()]
        if sentences:
            # Prefer up to 2-3 sentences from the first doc
            short = " ".join(sentences[:3])
        # if still long, shorten but prefer full-sentence cut
        if len(short) > 600:
            short = _summarize_text(short, n_sentences=3, max_chars=600)

    tldr = _first_n_sentences(short, n=1, max_chars=300) if short else ""

    # If the short summary is too short, try combining the top docs or key points
    if not short or len(short) < 50:
        combined = "\n\n".join(retrieved_docs[:2])
        alt = _first_n_sentences(combined, n=3, max_chars=800)
        if alt and len(alt) > len(short):
            short = alt
        else:
            # fallback to key points
            meta_extracted = _extract_metadata_from_docs(retrieved_docs)
            kps = meta_extracted.get("key_points", [])
            if kps:
                short = " ".join(kps[:3])

    detailed = ""
    if retrieved_docs:
        combined = "\n\n".join(retrieved_docs[:2])
        detailed = _cut_at_sentence(combined, 4000)

    metadata = {
        "tldr": tldr,
        "short_answer": short,
        "sections": meta.get("sections", []),
        "penalties": meta.get("penalties", []),
        "key_points": meta.get("key_points", []),
        "examples": meta.get("examples", []),
        "detailed": detailed,
    }

    # Build a single unified markdown section for UI simplicity
    markdown = _build_unified_from_meta(query, metadata)
    # Ensure the 'short_answer' in metadata summarizes the generated markdown
    try:
        short_from_md = _summarize_text(markdown, n_sentences=3, max_chars=600)
        tldr_from_md = _summarize_text(markdown, n_sentences=1, max_chars=250)
        metadata["short_answer"] = short_from_md
        metadata["tldr"] = tldr_from_md
    except Exception:
        pass
    return {"markdown": markdown, "metadata": metadata}


# backend/llm_service.py
import re
import os
import time
import concurrent.futures
from typing import List, Dict, Any

def _trim_doc(d: str, max_chars=2000):
    if not d:
        return ""
    s = d.strip()
    return s if len(s) <= max_chars else _cut_at_sentence(s, max_chars)


def _cut_at_sentence(text: str, max_chars: int):
    """Cut text to at most max_chars but prefer ending at a sentence boundary.

    If no sentence boundary exists within `max_chars`, allow a small forward
    extension to the next sentence terminator so we don't cut mid-sentence.
    """
    if not text:
        return ""
    s = text.strip()
    if len(s) <= max_chars:
        return s

    # Define sentence terminators (include Devanagari danda and em-dash/semicolon)
    terminators = ['.', '?', '!', '।', ';', '…']

    snippet = s[:max_chars]
    # find last terminator inside snippet
    last_sent_end = -1
    for t in terminators:
        pos = snippet.rfind(t)
        if pos > last_sent_end:
            last_sent_end = pos

    # if we found a reasonable sentence end (not too early), cut there
    if last_sent_end >= int(max_chars * 0.3):
        return snippet[: last_sent_end + 1].strip() + "..."

    # Otherwise, try extending forward a bit to reach the next terminator
    extension = 400
    forward_limit = min(len(s), max_chars + extension)
    forward_slice = s[:forward_limit]
    next_sent_end = -1
    for t in terminators:
        pos = forward_slice.find(t, max_chars)
        if pos != -1 and (next_sent_end == -1 or pos < next_sent_end):
            next_sent_end = pos

    if next_sent_end != -1 and next_sent_end - max_chars <= extension:
        return forward_slice[: next_sent_end + 1].strip() + "..."

    # Fallback: cut at last space inside snippet to avoid mid-word cut
    if " " in snippet:
        return snippet.rsplit(" ", 1)[0].strip() + "..."
    return snippet.strip() + "..."

def _first_n_sentences(text: str, n=2, max_chars=600):
    """
    Return the first n sentences of `text` joined. Avoid chopping sentences mid-word.
    """
    if not text:
        return ""
    # split on sentence-ending punctuation followed by whitespace
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())
    out = []
    total = 0
    for s in sentences:
        if not s:
            continue
        out.append(s.strip())
        total += len(s)
        if len(out) >= n or total >= max_chars:
            break
    return " ".join(out).strip()

def generate_legal_answer(query: str, retrieved_docs: List[str]) -> Dict[str, Any]:
    """
    Main entrypoint used by app.py. Returns {"markdown": str, "metadata": dict}
    """
    # If no retrieved docs, use deterministic fallback immediately (faster)
    if not retrieved_docs:
        logger.info("No retrieved docs; using fallback generation for query")
        return _fallback_generation(query, retrieved_docs)

    # Prepare prompt context using the single most relevant doc trimmed to a reasonable size
    prompt_context = _trim_doc((retrieved_docs or [""])[0], max_chars=1200)

    prompt = f"""You are LEXAI, an expert in Indian Penal Code (IPC).
Use ONLY the context below to answer the query. Provide: TL;DR (one short sentence), In short (2-3 bullets), Relevant IPC Sections (short bullets), Punishments/Penalties (short bullets), Key Legal Points (3 numbered items), Example (if available), and a short detailed explanation.
Context:
{prompt_context}

User Query: {query}
"""

    # Try Ollama (shorter timeout; fallback if not available).
    # Use a worker thread and enforced timeout to avoid long blocking calls.
    try:
        import ollama
        model_name = os.getenv("OLLAMA_MODEL", "phi3:latest")
        timeout_sec = float(os.getenv("OLLAMA_TIMEOUT", "6"))

        def _call_ollama(p):
            # Some OLLAMA client implementations accept timeout kwarg, some don't.
            try:
                return ollama.chat(model=model_name, messages=[{"role": "user", "content": p}], timeout=timeout_sec)
            except TypeError:
                return ollama.chat(model=model_name, messages=[{"role": "user", "content": p}])

        start = time.time()
        res = None
        try:
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
                future = ex.submit(_call_ollama, prompt)
                try:
                    # allow a small buffer beyond the model timeout
                    res = future.result(timeout=timeout_sec + 2)
                except concurrent.futures.TimeoutError:
                    logger.warning("ollama.chat timed out after %ss (model=%s)", timeout_sec, model_name)
                    try:
                        future.cancel()
                    except Exception:
                        pass
                    res = None
        except Exception as e:
            logger.warning("ollama execution failed: %s", e)

        duration = time.time() - start
        logger.info("ollama.chat finished in %.2fs (model=%s)", duration, model_name)

        # Normalize returned content
        content = None
        if res:
            if isinstance(res, dict):
                if "message" in res and isinstance(res["message"], dict):
                    content = res["message"].get("content") or res["message"].get("text")
                content = content or res.get("content") or res.get("text")
            else:
                content = str(res)

        if content:
            # produce lightweight metadata (short readable bullets) derived from docs
            extracted = _extract_metadata_from_docs(retrieved_docs)

            # Build short_answer and tldr using the assistant response (content)
            # Summary should reflect the LLM's answer (extractive summarization).
            short_answer = _summarize_text(content, n_sentences=3, max_chars=600)
            tldr = _summarize_text(content, n_sentences=1, max_chars=250)

            # If the extracted short_answer is too short or uninformative, expand it
            if not short_answer or len(short_answer) < 50:
                combined = " ".join((retrieved_docs or [])[:2])
                alt = _first_n_sentences(combined, n=3, max_chars=800)
                if alt and len(alt) > len(short_answer):
                    short_answer = alt
                # final fallback: join extracted key points into a compact paragraph
                if (not short_answer or len(short_answer) < 40) and extracted:
                    kps = extracted.get("key_points", [])
                    if kps:
                        short_answer = " ".join(kps[:3])

            metadata = {
                "tldr": tldr,
                "short_answer": short_answer,
                "sections": extracted.get("sections", [])[:4],
                "penalties": extracted.get("penalties", [])[:4],
                "key_points": extracted.get("key_points", [])[:5],
                "examples": extracted.get("examples", [])[:2],
                "detailed": _cut_at_sentence("\n\n".join((retrieved_docs or [""])[:2]), 8000),
            }

            # Build a single unified markdown from metadata (ChatGPT-like single section)
            markdown = _build_unified_from_meta(query, metadata)
            # Refresh short_answer/tldr based on the unified markdown
            try:
                metadata["short_answer"] = _summarize_text(markdown, n_sentences=3, max_chars=600)
                metadata["tldr"] = _summarize_text(markdown, n_sentences=1, max_chars=250)
            except Exception:
                pass

            return {"markdown": markdown, "metadata": metadata}
        else:
            logger.info("No content from ollama; falling back to deterministic generator")
    except Exception as e:
        logger.info("ollama not available or failed to initialize: %s", e)

    # fallback deterministic reader
    return _fallback_generation(query, retrieved_docs)

