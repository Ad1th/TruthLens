from fastapi import FastAPI, APIRouter, Request
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import hashlib
import time

app = FastAPI()
router = APIRouter()

# In-memory cache (for demo)
cache: Dict[str, Dict[str, Any]] = {}
CACHE_TTL = 24 * 60 * 60  # 24 hours

class Citation(BaseModel):
    title: str
    url: str
    score: float

class Flag(BaseModel):
    id: str
    span: str
    context: str
    type: str
    explanation: str
    confidence: float
    suggested_rewrite: str
    citations: List[Citation] = []

class AnalyzeRequest(BaseModel):
    url: str
    text: str
    config: Optional[Dict[str, Any]] = None

class AnalyzeResponse(BaseModel):
    overall_bias_score: int
    confidence: float
    flags: List[Flag]
    meta: Dict[str, Any]

# Placeholder classifier
def classify_text(text: str) -> AnalyzeResponse:
    # TODO: Replace with real LLM logic
    return AnalyzeResponse(
        overall_bias_score=58,
        confidence=0.87,
        flags=[
            Flag(
                id="f_1",
                span="the shocking truth",
                context="In this article we reveal the shocking truth behind...",
                type="emotional_trigger",
                explanation="Uses the emotionally charged phrase 'shocking truth' to provoke a strong reaction.",
                confidence=0.93,
                suggested_rewrite="the evidence about X indicates...",
                citations=[]
            )
        ],
        meta={
            "analyzed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "engine_version": "v0.1"
        }
    )

def short_hash(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:12]

@router.post("/api/v1/analyze", response_model=AnalyzeResponse)
async def analyze(request: AnalyzeRequest):
    text_hash = short_hash(request.text)
    now = time.time()
    # Check cache
    cached = cache.get(text_hash)
    if cached and now - cached["timestamp"] < CACHE_TTL:
        return cached["response"]
    # Otherwise, classify
    response = classify_text(request.text)
    cache[text_hash] = {"response": response, "timestamp": now}
    return response

# TODO: Add batchAnalyze and feedback endpoints

app.include_router(router)
