# AI Research Agent (FastAPI + React)

This project transforms the provided Colab notebook into a fully working AI Research Agent with a FastAPI backend and a React + Vite + Tailwind frontend.

## Features
- Planner → Searcher → Reader → Verifier → Briefer pipeline
- Gemini integration (loads once at startup) with graceful fallback
- Live progress via polling: POST `/research` then GET `/research/{task_id}`
- Structured final brief and PDF download

## Prerequisites
- Python 3.10+
- Node.js 18+

Optionally set for Gemini:
```
set GOOGLE_API_KEY=your_key_here   (Windows CMD)
```

## Backend Setup
```
python -m venv .venv
.venv\\Scripts\\activate
pip install -r backend/requirements.txt
uvicorn backend.app.main:app --reload --port 8000
```

## Frontend Setup
```
cd frontend
npm install
npm run dev
```

If your backend runs on a different host/port, create a `.env` file in `frontend/`:
```
VITE_API_BASE=http://localhost:8000
```

## Usage
1. Start backend and frontend.
2. Open the dev URL from Vite (default http://localhost:5173).
3. Enter a research query and click "Run Research". Watch progress and download the PDF when complete.

## Notes
- Without `GOOGLE_API_KEY`, the app uses a simple heuristic generator so it still works for demos.
- Web search uses DuckDuckGo HTML results; reading fetches pages and extracts text.
