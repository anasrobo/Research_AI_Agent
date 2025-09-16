import os
import asyncio
from typing import Optional

_model = None
_model_lock = asyncio.Lock()


def init_model():
    """Initialize the Gemini model once at startup if API key is available."""
    global _model
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        return
    try:
        import google.generativeai as genai
        genai.configure(api_key=api_key)
        # Prefer a fast, capable default. Users can change via env if desired.
        model_name = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
        _model = genai.GenerativeModel(model_name)
    except Exception:
        _model = None

async def generate_with_model(prompt: str) -> str:
    """Generate text using Gemini if available, else a heuristic fallback."""
    global _model
    if _model is None:
        return _fallback_generate(prompt)
    try:
        # google-generativeai is sync; run in thread
        import anyio
        def _call():
            resp = _model.generate_content(prompt)
            return getattr(resp, "text", None) or (resp.candidates[0].content.parts[0].text if resp.candidates else "")
        text: str = await anyio.to_thread.run_sync(_call)
        return text.strip()
    except Exception:
        return _fallback_generate(prompt)

def _fallback_generate(prompt: str) -> str:
    # Very simple prompt-echo fallback so the app still works without an API key
    head = "Draft based on heuristic analysis:"
    bullets = "\n".join(f"- {line.strip()}" for line in prompt.splitlines() if line.strip())
    return f"{head}\n\n{bullets}"
