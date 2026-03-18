# TruthLens Backend

This folder contains the FastAPI backend for TruthLens.

- `app/main.py` — FastAPI app and API endpoints
- `app/api/` — API route modules (future)
- `app/services/` — Service logic (future)
- `requirements.txt` — Python dependencies

## Run locally

1. Install dependencies: `pip install -r requirements.txt`
2. Start server: `uvicorn app.main:app --reload`

The API will be available at http://localhost:8000/api/v1/analyze
.
