from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import hashlib
import time

app = FastAPI()
router = APIRouter()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
    citations: List[Citation] = Field(default_factory=list)

class AnalyzeRequest(BaseModel):
    url: str
    text: str = Field(min_length=1, max_length=20000)
    config: Optional[Dict[str, Any]] = None


class BatchAnalyzeRequest(BaseModel):
    documents: List[AnalyzeRequest] = Field(min_length=1, max_length=20)


class FeedbackRequest(BaseModel):
    analysis_id: Optional[str] = None
    flag_id: str
    user_feedback: str = Field(pattern="^(up|down|not_relevant)$")
    comment: Optional[str] = Field(default=None, max_length=1000)

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
    if not request.url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="url must start with http:// or https://")

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


@router.post("/api/v1/batchAnalyze")
async def batch_analyze(request: BatchAnalyzeRequest):
    results = []
    for doc in request.documents:
        text_hash = short_hash(doc.text)
        now = time.time()
        cached = cache.get(text_hash)
        if cached and now - cached["timestamp"] < CACHE_TTL:
            results.append(cached["response"])
            continue
        response = classify_text(doc.text)
        cache[text_hash] = {"response": response, "timestamp": now}
        results.append(response)

    return {"count": len(results), "results": results}


@router.post("/api/v1/feedback")
async def feedback(request: FeedbackRequest):
    # TODO: Persist feedback to database.
    return {
        "status": "received",
        "flag_id": request.flag_id,
        "user_feedback": request.user_feedback,
        "received_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }

app.include_router(router)
