# TruthLens Backend

This folder contains the FastAPI backend for TruthLens.

- `app/main.py` — FastAPI app and API endpoints
- `app/api/` — API route modules (future)
- `app/services/` — Service logic (future)
- `requirements.txt` — Python dependencies

## Run locally

1. Install dependencies: `pip install -r requirements.txt`
2. Start server: `uvicorn app.main:app --reload`

The API will be available at http://localhost:8000/api/v1/analyze.

## Endpoints

- GET /api/v1/health
- POST /api/v1/analyze
- POST /api/v1/batchAnalyze
- POST /api/v1/feedback

## LLM Provider Behavior

The backend supports two modes:

- Heuristic mode: deterministic regex-based flagging, no external API needed.
- OpenAI-compatible mode: if OPENAI_API_KEY is set, the backend attempts an LLM analysis first.

If LLM fails for any reason, the service automatically falls back to heuristic mode and includes fallback details in meta.fallback_reason.

### Optional environment variables

- OPENAI_API_KEY
- OPENAI_BASE_URL (default: https://api.openai.com/v1)
- OPENAI_MODEL (default: gpt-4o-mini)

## Test

Run backend tests:

pytest -q
