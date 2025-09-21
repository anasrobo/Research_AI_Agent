import os
import asyncio
import uuid
from datetime import datetime
from typing import Dict, Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from .agent import run_pipeline
from .models import init_model
from .pathway_rag import init_pathway_rag
from dotenv import load_dotenv

# Simple in-memory task store
TASKS: Dict[str, Dict[str, Any]] = {}

class ResearchRequest(BaseModel):
    query: str

app = FastAPI(title="AI Research Agent")

# CORS for frontend dev servers
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def on_startup():
    # Load env vars from .env then initialize Gemini once
    load_dotenv(dotenv_path=os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))
    init_model()
    # Start Pathway-backed ingestion layer (folder watcher now; can be swapped for Pathway streaming)
    init_pathway_rag()

async def _run_task(task_id: str, query: str):
    TASKS[task_id] = {
        "task_id": task_id,
        "query": query,
        "status": "running",
        "steps": {
            "planning": None,
            "searching": None,
            "reading": None,
            "verifying": None,
            "reflecting": None,
            "briefing": None,
        },
        "brief": None,
        "started_at": datetime.utcnow().isoformat() + "Z",
        "completed_at": None,
        "error": None,
    }
    try:
        async for update in run_pipeline(query):
            # update is like { step: str, data: Any }
            step = update.get("step")
            if step == "brief":
                TASKS[task_id]["brief"] = update.get("data")
            else:
                TASKS[task_id]["steps"][step] = update.get("data")
        TASKS[task_id]["status"] = "completed"
        TASKS[task_id]["completed_at"] = datetime.utcnow().isoformat() + "Z"
    except Exception as e:
        TASKS[task_id]["status"] = "error"
        TASKS[task_id]["error"] = str(e)
        TASKS[task_id]["completed_at"] = datetime.utcnow().isoformat() + "Z"

@app.post("/research")
async def start_research(req: ResearchRequest):
    if not req.query or not req.query.strip():
        raise HTTPException(status_code=400, detail="Query is required")
    task_id = str(uuid.uuid4())
    # fire-and-forget background task
    asyncio.create_task(_run_task(task_id, req.query.strip()))
    return {"task_id": task_id}

@app.get("/research/{task_id}")
async def get_research(task_id: str):
    task = TASKS.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task

# One-shot RAG endpoint used by the frontend when available
@app.post("/api/endpoint")
async def api_endpoint(req: ResearchRequest):
    if not req.query or not req.query.strip():
        raise HTTPException(status_code=400, detail="Query is required")
    result: Dict[str, Any] = {}
    # Keep step names but capitalize keys to match OneShotResponse in frontend
    mapping = {
        "planning": "Planning",
        "searching": "Searching",
        "reading": "Reading",
        "verifying": "Verifying",
        "reflecting": "Reflecting",
        "brief": "Briefing",
    }
    async for update in run_pipeline(req.query.strip()):
        step = update.get("step")
        key = mapping.get(step, step)
        result[key] = update.get("data")
    return result

# Health check for Render
@app.get("/healthz")
async def healthz():
    return {"status": "ok"}

# Root route (so Render and humans don’t get 404s)
@app.get("/", include_in_schema=False)
async def root():
    return {"message": "Research AI Agent is live 🚀", "docs": "/docs"}
