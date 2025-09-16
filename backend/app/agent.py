import asyncio
import re
from typing import Any, AsyncGenerator, Dict, List, Optional

import requests
from bs4 import BeautifulSoup

from .models import generate_with_model
from .pathway_rag import pathway_search, pathway_read, pathway_ingest_external

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
}

async def run_pipeline(query: str) -> AsyncGenerator[Dict[str, Any], None]:
    plan = await _plan(query)
    yield {"step": "planning", "data": plan}

    sources = await _search(plan)
    yield {"step": "searching", "data": sources}

    readings = await _read(sources)
    yield {"step": "reading", "data": readings}

    verification = await _verify(query, readings)
    yield {"step": "verifying", "data": verification}

    # Reflection: decide if we need more/alternative sources, then adapt
    reflection = await _reflect(query, verification, readings)
    yield {"step": "reflecting", "data": reflection}

    if reflection.get("need_more"):
        adapt_plan = {"query": reflection.get("refined_query", query)}
        extra_sources = await _search(adapt_plan)
        # Keep only new hosts
        seen_hosts = { _host_of(s.get("url","")) for s in sources }
        extra_sources = [s for s in extra_sources if _host_of(s.get("url","")) not in seen_hosts]
        if extra_sources:
            yield {"step": "searching", "data": sources + extra_sources}
            extra_reads = await _read(extra_sources)
            readings = readings + extra_reads
            yield {"step": "reading", "data": readings}

    brief = await _brief(query, readings, verification)
    yield {"step": "brief", "data": brief}

async def _plan(query: str) -> Dict[str, Any]:
    prompt = f"You are an AI research planner. Break down the research steps (3-6 bullets) for the query: {query}."
    text = await generate_with_model(prompt)
    steps = [s.strip(" -•\t") for s in re.split(r"\n+", text) if s.strip()][:6]
    return {"query": query, "steps": steps}

def _ddg_clean_url(href: str) -> str:
    # DuckDuckGo often returns //duckduckgo.com/l/?uddg=<encoded>
    try:
        if href.startswith("//duckduckgo.com/l/?") or href.startswith("/l/?"):
            from urllib.parse import urlparse, parse_qs, unquote
            if href.startswith("//"):
                href_full = "https:" + href
            else:
                href_full = "https://duckduckgo.com" + href
            qs = parse_qs(urlparse(href_full).query)
            if "uddg" in qs:
                return unquote(qs["uddg"][0])
        if href.startswith("//"):
            return "https:" + href
        if href.startswith("http"):
            return href
        # Fallback
        return "https://" + href.lstrip("/")
    except Exception:
        return href

async def _search(plan: Dict[str, Any]) -> List[Dict[str, str]]:
    """
    Replaced with Pathway-backed retrieval.
    - Previously: Scraped DuckDuckGo results per request.
    - Now: Queries the live vector index for the most relevant sources.

    We preserve the shape: List[{"title", "url"}].
    """
    q = plan.get("query")
    # Use the live RAG index populated by streaming ingestion
    results = pathway_search(q, top_k=12)
    if not results:
        # Fallback: scrape DDG and ingest results into the live index, then re-query
        try:
            url = "https://duckduckgo.com/html/"
            params = {"q": q}
            r = requests.get(url, params=params, headers=HEADERS, timeout=20)
            r.raise_for_status()
            soup = BeautifulSoup(r.text, "html.parser")
            scraped = []
            for a in soup.select("a.result__a, a.result__url, a.result__a.js-result-title-link")[:10]:
                href_raw = a.get("href")
                title = a.get_text(strip=True)
                if href_raw and title:
                    url_clean = _ddg_clean_url(href_raw)
                    scraped.append({"title": title, "url": url_clean})
            # Fetch content and ingest
            docs = []
            for s in scraped:
                try:
                    rr = requests.get(s["url"], headers=HEADERS, timeout=20)
                    rr.raise_for_status()
                    text = _extract_text(rr.text)
                    if text.strip():
                        docs.append({"title": s["title"], "url": s["url"], "content": text[:20000]})
                except Exception:
                    continue
            if docs:
                pathway_ingest_external(docs)
                results = pathway_search(q, top_k=12)
        except Exception:
            pass
    # Ensure only title/url fields to match frontend expectations
    return [{"title": r.get("title"), "url": r.get("url")} for r in results]

async def _read(sources: List[Dict[str, str]]) -> List[Dict[str, Any]]:
    """
    Replaced with Pathway-backed retrieval.
    - Previously: Fetched each URL and extracted text on the fly.
    - Now: Reads top-k documents directly from the live index built by the ingestion pipeline.

    We ignore the incoming `sources` and re-rank from the index for better recall.
    """
    # Combine titles/urls to a query string for better semantic recall
    query_hint = "\n".join(f"{s.get('title','')} {s.get('url','')}" for s in sources)
    docs = pathway_read(query_hint or "")
    if not docs and sources:
        # Fallback: fetch the provided sources, ingest, then re-query
        ing_docs: List[Dict[str, Any]] = []
        for s in sources[:8]:
            u = s.get("url")
            if not u:
                continue
            try:
                rr = requests.get(u, headers=HEADERS, timeout=20)
                rr.raise_for_status()
                text = _extract_text(rr.text)
                if text.strip():
                    ing_docs.append({"title": s.get("title") or u, "url": u, "content": text[:20000]})
            except Exception:
                continue
        if ing_docs:
            pathway_ingest_external(ing_docs)
            docs = pathway_read(query_hint or "")
    # Match previous shape: include title, url, content; optional analysis can be added later
    readings: List[Dict[str, Any]] = []
    for d in docs:
        readings.append({
            "title": d.get("title"),
            "url": d.get("url"),
            "content": (d.get("content") or "")[:12000],
            "images": [],
            "tables": [],
            "analysis": None,
        })
        await asyncio.sleep(0)
    return readings

async def _verify(query: str, readings: List[Dict[str, Any]]) -> Dict[str, Any]:
    # Simple model-assisted verification
    contents = "\n\n".join(
        f"Source: {r.get('title')}\nURL: {r.get('url')}\nExcerpt: {r.get('content','')[:800]}" for r in readings if r.get("content")
    )
    prompt = (
        "You are a fact-checking assistant. Given the research question and excerpts from sources, "
        "assess credibility, consensus, and risks. Provide concise bullets.\n\n"
        f"Research Question: {query}\n\nSources:\n{contents}\n\n"
        "Return sections: Credibility, Consensus, Conflicts, Risks."
    )
    text = await generate_with_model(prompt)
    return {"analysis": text}

async def _brief(query: str, readings: List[Dict[str, Any]], verification: Dict[str, Any]) -> Dict[str, str]:
    sources_formatted = "\n".join(f"- {r.get('title')} ({r.get('url')})" for r in readings if r.get("title") and r.get("url"))
    prompt = (
        "Create a structured research brief with sections: Introduction, Key Findings, Risks, Conclusion. "
        "Use clear, concise, non-repetitive bullets. Include a short sources list at the end.\n\n"
        f"Question: {query}\n\nVerification Notes:\n{verification.get('analysis','')}\n\nSources:\n{sources_formatted}"
    )
    text = await generate_with_model(prompt)
    # Try to split into sections heuristically
    def extract(section: str) -> str:
        m = re.search(section + r"[:\n]+(.*?)(?=\n\w|$)", text, re.IGNORECASE | re.DOTALL)
        return m.group(1).strip() if m else ""
    intro = extract("Introduction") or text[:400]
    findings = extract("Key Findings")
    risks = extract("Risks")
    conclusion = extract("Conclusion")
    return {
        "Introduction": intro,
        "Key Findings": findings,
        "Risks": risks,
        "Conclusion": conclusion,
        "Sources": sources_formatted,
    }

async def _reflect(query: str, verification: Dict[str, Any], readings: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Lightweight reflection to adapt search if bias/insufficiency detected."""
    prompt = (
        "You are a reflection module. Given the research question, verification notes, and current sources, "
        "answer in JSON with keys: need_more (true/false), refined_query (string).\n\n"
        f"Question: {query}\n\nVerification:\n{verification.get('analysis','')}\n\n"
        f"Current hosts: {', '.join(sorted({_host_of(r.get('url','')) for r in readings if r.get('url')}))}\n"
        "If bias or lack of credible sources is detected, set need_more to true and suggest a refined query emphasizing credible, authoritative domains."
    )
    text = await generate_with_model(prompt)
    need_more = False
    refined = query
    try:
        import json
        data = json.loads(text)
        need_more = bool(data.get("need_more"))
        refined = data.get("refined_query") or query
    except Exception:
        # Heuristic fallback
        if re.search(r"bias|insufficient|lack of|unreliable", verification.get("analysis",""), re.I):
            need_more = True
            refined = query + " site:.gov OR site:.edu"
    return {"need_more": need_more, "refined_query": refined}

# --- helpers ---

def _extract_text(html: str) -> str:
    try:
        # Try readability for cleaner article text
        from readability import Document  # type: ignore
        doc = Document(html)
        content_html = doc.summary()
        soup = BeautifulSoup(content_html, "html.parser")
        return soup.get_text(" \n", strip=True)
    except Exception:
        soup = BeautifulSoup(html, "html.parser")
        for tag in soup(["script", "style", "noscript", "header", "footer", "nav"]):
            tag.decompose()
        return soup.get_text(" \n", strip=True)

def _host_of(url: str) -> str:
    try:
        from urllib.parse import urlparse
        return (urlparse(url).hostname or "").lower().lstrip("www.")
    except Exception:
        return ""

def _absolute_url(base: str, src: str) -> str:
    try:
        from urllib.parse import urljoin
        return urljoin(base, src)
    except Exception:
        return src

def _extract_media(html: str, base_url: str) -> (List[Dict[str, str]], List[Dict[str, Any]]):
    soup = BeautifulSoup(html, "html.parser")
    images: List[Dict[str, str]] = []
    for img in soup.find_all("img"):
        src = img.get("src") or img.get("data-src")
        if not src:
            continue
        src = _absolute_url(base_url, src)
        alt = (img.get("alt") or "").strip()
        images.append({"src": src, "alt": alt})
        if len(images) >= 6:
            break
    tables: List[Dict[str, Any]] = []
    for tbl in soup.find_all("table"):
        headers: List[str] = []
        first = tbl.find("tr")
        if first:
            ths = first.find_all(["th", "td"]) if first else []
            headers = [th.get_text(strip=True) for th in ths]
        rows: List[List[str]] = []
        for tr in tbl.find_all("tr")[1:4]:
            tds = [td.get_text(strip=True) for td in tr.find_all(["td", "th"])]
            if tds:
                rows.append(tds)
        if headers or rows:
            tables.append({"headers": headers, "rows": rows})
        if len(tables) >= 3:
            break
    return images, tables
