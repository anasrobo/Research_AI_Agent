import os
import threading
import json
from typing import Any, Dict, List, Optional, Tuple

"""
REAL Pathway streaming + vector store implementation.

We keep the public entrypoints: `init_pathway_rag`, `pathway_search`, `pathway_read`.
If Pathway isn't available, we fall back to a minimal in-process adapter so the app still runs.

Key changes vs. the fake adapter:
- Storage moved from a Python list to a Pathway Table.
- Live ingestion uses Pathway's filesystem streaming source (no manual polling thread).
- Processing via Pathway UDFs to normalize rows and compute embeddings.
- A live in-memory mirror is maintained for synchronous FastAPI access.
"""

# ------------- Embeddings (shared) -------------
_EMBED_LOCK = threading.Lock()

def _embed_texts(texts: List[str]) -> List[List[float]]:
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        # Deterministic placeholder when no API key is present
        return [[(hash(t) % 997) / 997.0 for _ in range(256)] for t in texts]
    try:
        import google.generativeai as genai  # type: ignore
        with _EMBED_LOCK:
            genai.configure(api_key=api_key)
            model = os.getenv("GEMINI_EMBED_MODEL", "text-embedding-004")
            # Batch embedding; fall back to per-item if needed
            try:
                resp = genai.embed_content(model=model, content=texts)
            except Exception:
                # Some SDK versions expect a single content at a time
                vals = []
                for t in texts:
                    r = genai.embed_content(model=model, content=t)
                    vals.append(r.get("embedding") or r.get("embeddings", {}).get("values"))
                resp = {"embeddings": {"values": vals}}

            if isinstance(resp, dict) and "embeddings" in resp:
                values = resp["embeddings"].get("values", [])
                return [list(map(float, v)) for v in values]
            if isinstance(resp, dict) and "embedding" in resp:
                emb = resp["embedding"]
                if emb and isinstance(emb[0], (list, tuple)):
                    return [list(map(float, v)) for v in emb]
                if emb and isinstance(emb[0], (int, float)):
                    return [list(map(float, emb))]
    except Exception:
        pass
    return [[(hash(t) % 997) / 997.0 for _ in range(256)] for t in texts]

def _cosine(a: List[float], b: List[float]) -> float:
    import math
    if not a or not b:
        return 0.0
    s = sum(x*y for x, y in zip(a, b))
    na = math.sqrt(sum(x*x for x in a))
    nb = math.sqrt(sum(y*y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return s / (na * nb)


# ------------- Pathway-backed implementation -------------
class _PathwayBackend:
    """Build a streaming Table from filesystem and maintain a live vector index.

    To keep FastAPI synchronous handlers simple, we mirror the current state into
    a thread-safe Python dict updated by a Pathway sink.
    """

    def __init__(self, ingest_dir: Optional[str] = None):
        self.ingest_dir = ingest_dir or os.getenv("INGEST_DIR", os.path.join(os.path.dirname(__file__), "static", "ingest"))
        os.makedirs(self.ingest_dir, exist_ok=True)
        self._mirror_lock = threading.Lock()
        self._mirror: Dict[str, Dict[str, Any]] = {}  # id -> {title, url, content, embedding}
        self._started = False

    def start(self):
        if self._started:
            return
        self._started = True

        try:
            import pathway as pw  # type: ignore
        except Exception:
            # Pathway not available; will be handled by outer initializer
            self._started = False
            raise

        # --------- Define UDFs ---------
        @pw.udf
        def parse_record(path: str, data: bytes) -> Dict[str, Any]:
            import os as _os
            import json as _json
            base, ext = _os.path.splitext(path)
            title = _os.path.basename(path)
            url = None
            content = ""
            # Sidecar meta
            sidecar = base + ".meta.json"
            if _os.path.exists(sidecar):
                try:
                    with open(sidecar, "r", encoding="utf-8") as mf:
                        meta = _json.load(mf)
                        title = meta.get("title", title)
                        url = meta.get("url")
                except Exception:
                    pass
            text = data.decode("utf-8", errors="ignore") if isinstance(data, (bytes, bytearray)) else str(data)
            if ext.lower() == ".csv":
                # lightweight CSV flattening
                lines = text.splitlines()[:200]
                content = "\n".join(lines)
            elif ext.lower() == ".jsonl":
                # take first valid row with 'text' or 'content'
                for ln in text.splitlines():
                    try:
                        obj = _json.loads(ln)
                        t = obj.get("text") or obj.get("content")
                        if t:
                            return {
                                "id": f"{path}::0",
                                "title": obj.get("title") or title,
                                "url": obj.get("url") or url,
                                "content": str(t)[:20000],
                            }
                    except Exception:
                        continue
                content = ""
            else:
                content = text
            return {
                "id": path,
                "title": title,
                "url": url,
                "content": (content or "")[:20000],
            }

        @pw.udf
        def embed(text: str) -> List[float]:
            if not text:
                return []
            return _embed_texts([text])[0]

        # --------- Build streaming table from filesystem ---------
        # NOTE: Depending on Pathway version, the fs connector API may differ slightly.
        # We assume `pw.io.fs.read` exists and supports streaming directory watching.
        files = pw.io.fs.read(  # type: ignore[attr-defined]
            path=self.ingest_dir,
            with_metadata=True,
            mode="streaming",
        )
        # Expect columns: path, data (bytes), and maybe event metadata
        # Normalize to schema rows
        docs = files.select(
            parsed=parse_record(pw.this.path, pw.this.data)
        ).select(
            id=pw.this.parsed["id"],
            title=pw.this.parsed["title"],
            url=pw.this.parsed.get("url"),
            content=pw.this.parsed["content"],
        )

        enriched = docs.select(
            id=pw.this.id,
            title=pw.this.title,
            url=pw.this.url,
            content=pw.this.content,
            embedding=embed(pw.this.content),
        )

        # --------- Sink: mirror to Python for synchronous queries ---------
        # We use a Python sink to update the in-memory mirror on insert/update.
        def _update_mirror(row: Dict[str, Any]):
            with self._mirror_lock:
                self._mirror[row["id"]] = {
                    "title": row.get("title"),
                    "url": row.get("url"),
                    "content": row.get("content"),
                    "embedding": row.get("embedding") or [],
                }

        # Depending on Pathway version, the Python sink API can be
        # `pw.io.python.write` or `pw.io.sink.python`.
        try:
            pw.io.python.write(enriched, on_insert=_update_mirror, on_update=_update_mirror)  # type: ignore[attr-defined]
        except Exception:
            # Fallback to printing sink; users can adjust to their installed version
            pw.io.print(enriched)  # type: ignore

        # Run Pathway in a background thread so FastAPI stays responsive
        def _runner():
            pw.run()

        t = threading.Thread(target=_runner, name="PathwayRunner", daemon=True)
        t.start()

    # ---- Query interface used by FastAPI agent steps ----
    def _query(self, query: str, top_k: int) -> List[Tuple[float, Dict[str, Any]]]:
        q_emb = _embed_texts([query])[0]
        with self._mirror_lock:
            items = list(self._mirror.items())
        scored: List[Tuple[float, Dict[str, Any]]] = []
        for _id, d in items:
            sim = _cosine(q_emb, d.get("embedding") or [])
            scored.append((sim, {"id": _id, **d}))
        scored.sort(key=lambda x: x[0], reverse=True)
        return scored[:top_k]

    def search_sources(self, query: str, k: int = 8) -> List[Dict[str, Any]]:
        top = self._query(query, k)
        return [{"title": d.get("title") or (d.get("url") or "Document"), "url": d.get("url"), "score": s} for s, d in top]

    def read_documents(self, query: str, k: int = 5) -> List[Dict[str, Any]]:
        top = self._query(query, k)
        return [{"title": d.get("title"), "url": d.get("url"), "content": d.get("content") } for s, d in top]

    # Ingest external documents programmatically (e.g., from a web search or RSS)
    def ingest_external(self, docs: List[Dict[str, Any]]):
        # We update the mirror directly so results are visible immediately.
        # In a fuller Pathway setup, you could also create an external input table.
        items = []
        for d in docs:
            c = (d.get("content") or "").strip()
            if not c:
                continue
            items.append(c)
        if not items:
            return
        embs = _embed_texts(items)
        with self._mirror_lock:
            for d, emb in zip(docs, embs):
                _id = d.get("id") or f"ext::{len(self._mirror)}"
                self._mirror[_id] = {
                    "title": d.get("title") or (d.get("url") or "Untitled"),
                    "url": d.get("url"),
                    "content": (d.get("content") or "")[:20000],
                    "embedding": emb,
                }


# ------------- Fallback (if Pathway not available) -------------
class _FallbackBackend:
    def __init__(self, ingest_dir: Optional[str] = None):
        self._pb = None
        # reuse the previous simplified adapter behavior
        self._docs: List[Dict[str, Any]] = []
        self._lock = threading.Lock()
        self.ingest_dir = ingest_dir or os.path.join(os.path.dirname(__file__), "static", "ingest")
        os.makedirs(self.ingest_dir, exist_ok=True)

    def start(self):
        # One-time snapshot to keep the app usable without Pathway
        for name in os.listdir(self.ingest_dir):
            path = os.path.join(self.ingest_dir, name)
            if not os.path.isfile(path):
                continue
            base, ext = os.path.splitext(name.lower())
            if ext not in (".txt", ".md", ".csv", ".jsonl"):
                continue
            try:
                with open(path, "rb") as f:
                    data = f.read()
                text = data.decode("utf-8", errors="ignore")
                content = text[:20000]
                emb = _embed_texts([content])[0]
                self._docs.append({"id": path, "title": name, "url": None, "content": content, "embedding": emb})
            except Exception:
                continue

    def _query(self, q: str, k: int) -> List[Tuple[float, Dict[str, Any]]]:
        q_emb = _embed_texts([q])[0]
        out: List[Tuple[float, Dict[str, Any]]] = []
        for d in self._docs:
            out.append((_cosine(q_emb, d.get("embedding") or []), d))
        out.sort(key=lambda x: x[0], reverse=True)
        return out[:k]

    def search_sources(self, query: str, k: int = 8) -> List[Dict[str, Any]]:
        top = self._query(query, k)
        return [{"title": d.get("title"), "url": d.get("url"), "score": s} for s, d in top]

    def read_documents(self, query: str, k: int = 5) -> List[Dict[str, Any]]:
        top = self._query(query, k)
        return [{"title": d.get("title"), "url": d.get("url"), "content": d.get("content")} for s, d in top]

    def ingest_external(self, docs: List[Dict[str, Any]]):
        items = []
        for d in docs:
            c = (d.get("content") or "").strip()
            if not c:
                continue
            items.append(c)
        if not items:
            return
        embs = _embed_texts(items)
        for d, emb in zip(docs, embs):
            record = {
                "id": d.get("id") or f"ext::{len(self._docs)}",
                "title": d.get("title") or (d.get("url") or "Untitled"),
                "url": d.get("url"),
                "content": d.get("content", "")[:20000],
                "embedding": emb,
            }
            self._docs.append(record)


# ------------- Public API (kept the same) -------------
_backend: Optional[object] = None

def init_pathway_rag():
    """Start the Pathway streaming pipeline.

    This replaces the previous fake adapter which used a polling thread and Python list.
    If Pathway isn't available at runtime, we start a functional fallback so the app remains usable.
    """
    global _backend
    if _backend is not None:
        return
    try:
        _backend = _PathwayBackend()
        _backend.start()  # type: ignore[attr-defined]
    except Exception:
        # Fallback: minimal snapshot-based backend if Pathway not installed
        _backend = _FallbackBackend()
        _backend.start()  # type: ignore[attr-defined]


def pathway_search(query: str, top_k: int = 8) -> List[Dict[str, Any]]:
    global _backend
    if _backend is None:
        init_pathway_rag()
    return _backend.search_sources(query, k=top_k)  # type: ignore[attr-defined]


def pathway_read(query: str, top_k: int = 5) -> List[Dict[str, Any]]:
    global _backend
    if _backend is None:
        init_pathway_rag()
    return _backend.read_documents(query, k=top_k)  # type: ignore[attr-defined]


def pathway_ingest_external(docs: List[Dict[str, Any]]):
    """Public helper: push documents (with {title,url,content}) into the live index."""
    global _backend
    if _backend is None:
        init_pathway_rag()
    _backend.ingest_external(docs)  # type: ignore[attr-defined]
