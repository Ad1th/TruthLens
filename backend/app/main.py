from fastapi import APIRouter, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Any, Dict, List, Optional, Tuple
import hashlib
import json
import os
import re
import time
import urllib.error
import urllib.request

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

DEFAULT_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
DEFAULT_OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "openai").strip().lower()

GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
GEMINI_BASE_URL = os.getenv("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

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

PATTERNS: List[Tuple[str, str, str, str]] = [
    (
        "emotional_trigger",
        r"\b(shocking|outrageous|disgusting|terrifying|devastating)\b",
        "Emotionally charged wording can increase persuasion while reducing precision.",
        "Use neutral wording and include a verifiable claim.",
    ),
    (
        "certainty_overclaim",
        r"\b(always|never|undeniable|proves that|everyone knows)\b",
        "Absolute certainty can overstate evidence and hide uncertainty.",
        "Add nuance, uncertainty, or scope limits to the claim.",
    ),
    (
        "loaded_label",
        r"\b(elites|traitors|propaganda machine|fake news)\b",
        "Loaded labels frame groups before evidence is presented.",
        "Replace labels with specific actors, actions, and sources.",
    ),
    (
        "speculation_as_fact",
        r"\b(clearly|obviously|without a doubt)\b",
        "This phrasing can present interpretation as fact.",
        "Separate observed facts from interpretation.",
    ),
]


def now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def clamp_score(score: int) -> int:
    return max(0, min(100, score))


def clamp_confidence(value: float) -> float:
    return max(0.0, min(1.0, value))


def context_window(text: str, start: int, end: int, max_len: int = 120) -> str:
    left = max(0, start - max_len // 2)
    right = min(len(text), end + max_len // 2)
    return text[left:right].strip()


def make_flag_id(flag_type: str, idx: int) -> str:
    return f"{flag_type}_{idx}"


def heuristic_classify(text: str, sensitivity: str = "2") -> AnalyzeResponse:
    flags: List[Flag] = []
    per_pattern_limit = 1 if sensitivity == "1" else (2 if sensitivity == "2" else 3)

    for flag_type, pattern, explanation, rewrite in PATTERNS:
        matches = list(re.finditer(pattern, text, flags=re.IGNORECASE))[:per_pattern_limit]
        for idx, match in enumerate(matches, start=1):
            span = match.group(0)
            flags.append(
                Flag(
                    id=make_flag_id(flag_type, idx),
                    span=span,
                    context=context_window(text, match.start(), match.end()),
                    type=flag_type,
                    explanation=explanation,
                    confidence=0.72 if sensitivity == "1" else (0.8 if sensitivity == "2" else 0.86),
                    suggested_rewrite=rewrite,
                    citations=[],
                )
            )

    base = 12
    intensity = 14 if sensitivity == "1" else (18 if sensitivity == "2" else 22)
    overall_bias_score = clamp_score(base + len(flags) * intensity)
    confidence = clamp_confidence(0.58 + min(0.35, len(flags) * 0.07))

    return AnalyzeResponse(
        overall_bias_score=overall_bias_score,
        confidence=confidence,
        flags=flags,
        meta={
            "analyzed_at": now_iso(),
            "engine_version": "v1.0-heuristic",
            "provider": "heuristic",
            "flags_detected": len(flags),
        },
    )


def parse_llm_response(payload: Dict[str, Any], source_text: str, provider: str) -> AnalyzeResponse:
    raw_score = int(payload.get("overall_bias_score", 0))
    raw_conf = float(payload.get("confidence", 0.0))
    raw_flags = payload.get("flags", [])

    flags: List[Flag] = []
    for idx, raw_flag in enumerate(raw_flags, start=1):
        if not isinstance(raw_flag, dict):
            continue
        span = str(raw_flag.get("span", "")).strip()
        if not span:
            continue
        context = str(raw_flag.get("context", "")).strip()
        if not context:
            pos = source_text.lower().find(span.lower())
            if pos >= 0:
                context = context_window(source_text, pos, pos + len(span))
            else:
                context = span

        citations: List[Citation] = []
        raw_citations = raw_flag.get("citations", [])
        if isinstance(raw_citations, list):
            for raw_citation in raw_citations[:3]:
                if not isinstance(raw_citation, dict):
                    continue
                title = str(raw_citation.get("title", "")).strip()
                url = str(raw_citation.get("url", "")).strip()
                if not title or not url:
                    continue
                score = float(raw_citation.get("score", 0.5))
                citations.append(Citation(title=title, url=url, score=clamp_confidence(score)))

        flags.append(
            Flag(
                id=f"llm_{idx}",
                span=span,
                context=context,
                type=str(raw_flag.get("type", "framing")).strip() or "framing",
                explanation=str(raw_flag.get("explanation", "Potential bias framing detected.")).strip(),
                confidence=clamp_confidence(float(raw_flag.get("confidence", 0.7))),
                suggested_rewrite=str(
                    raw_flag.get("suggested_rewrite", "Rewrite with neutral and specific language.")
                ).strip(),
                citations=citations,
            )
        )

    return AnalyzeResponse(
        overall_bias_score=clamp_score(raw_score),
        confidence=clamp_confidence(raw_conf),
        flags=flags,
        meta={
            "analyzed_at": now_iso(),
            "engine_version": "v1.0-llm",
            "provider": provider,
            "flags_detected": len(flags),
        },
    )


def llm_classify(text: str, url: str, config: Dict[str, Any]) -> AnalyzeResponse:
    if not OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY is not configured")

    model = str(config.get("model") or DEFAULT_MODEL)
    sensitivity = str(config.get("sensitivity") or "2")

    prompt = {
        "role": "user",
        "content": (
            "Analyze this webpage text for manipulative language and potential bias. "
            "Return strict JSON with keys: overall_bias_score (0-100 int), confidence (0-1 float), "
            "flags (array). Each flag must include: span, context, type, explanation, confidence, suggested_rewrite, citations. "
            "Citations can be empty if unavailable."
            f"\n\nURL: {url}"
            f"\nSensitivity: {sensitivity}"
            f"\n\nTEXT:\n{text[:20000]}"
        ),
    }

    request_body = {
        "model": model,
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "system",
                "content": "You are a media-bias analyst. Output only valid JSON.",
            },
            prompt,
        ],
        "temperature": 0.2,
    }

    endpoint = f"{DEFAULT_OPENAI_BASE_URL.rstrip('/')}/chat/completions"
    req = urllib.request.Request(
        endpoint,
        data=json.dumps(request_body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {OPENAI_API_KEY}",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"LLM HTTP error {exc.code}: {detail[:300]}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"LLM connection failed: {exc.reason}") from exc

    try:
        content = body["choices"][0]["message"]["content"]
        payload = json.loads(content)
    except (KeyError, IndexError, TypeError, json.JSONDecodeError) as exc:
        raise RuntimeError("LLM returned unexpected payload") from exc

    return parse_llm_response(payload, text, provider="openai-compatible")


def gemini_classify(text: str, url: str, config: Dict[str, Any]) -> AnalyzeResponse:
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is not configured")

    model = str(config.get("model") or GEMINI_MODEL)
    sensitivity = str(config.get("sensitivity") or "2")

    prompt_text = (
        "Analyze this webpage text for manipulative language and potential bias. "
        "Return strict JSON with keys: overall_bias_score (0-100 int), confidence (0-1 float), "
        "flags (array). Each flag must include: span, context, type, explanation, confidence, "
        "suggested_rewrite, citations. Citations can be empty if unavailable."
        f"\n\nURL: {url}"
        f"\nSensitivity: {sensitivity}"
        f"\n\nTEXT:\n{text[:20000]}"
    )

    request_body = {
        "systemInstruction": {
            "parts": [{"text": "You are a media-bias analyst. Output only valid JSON."}],
        },
        "contents": [
            {
                "role": "user",
                "parts": [{"text": prompt_text}],
            }
        ],
        "generationConfig": {
            "temperature": 0.2,
            "responseMimeType": "application/json",
        },
    }

    endpoint = f"{GEMINI_BASE_URL.rstrip('/')}/models/{model}:generateContent"
    req = urllib.request.Request(
        endpoint,
        data=json.dumps(request_body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": GEMINI_API_KEY,
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Gemini HTTP error {exc.code}: {detail[:300]}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Gemini connection failed: {exc.reason}") from exc

    try:
        candidates = body["candidates"]
        content = candidates[0]["content"]
        parts = content["parts"]
        model_text = parts[0]["text"]
        payload = json.loads(model_text)
    except (KeyError, IndexError, TypeError, json.JSONDecodeError) as exc:
        raise RuntimeError("Gemini returned unexpected payload") from exc

    return parse_llm_response(payload, text, provider="gemini")


def classify_text(text: str, url: str, config: Optional[Dict[str, Any]] = None) -> AnalyzeResponse:
    cfg = config or {}
    sensitivity = str(cfg.get("sensitivity") or "2")
    heuristics_only = bool(cfg.get("heuristics_only", False))
    provider = str(cfg.get("provider") or LLM_PROVIDER or "openai").strip().lower()

    if heuristics_only:
        return heuristic_classify(text, sensitivity=sensitivity)

    try:
        if provider == "gemini":
            return gemini_classify(text, url, cfg)
        return llm_classify(text, url, cfg)
    except Exception as exc:
        fallback = heuristic_classify(text, sensitivity=sensitivity)
        fallback.meta["fallback_reason"] = str(exc)
        fallback.meta["provider"] = "heuristic-fallback"
        fallback.meta["llm_provider"] = provider
        return fallback

def short_hash(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:12]


def cache_key_for(request: AnalyzeRequest) -> str:
    config_str = json.dumps(request.config or {}, sort_keys=True)
    seed = f"{request.url}|{request.text}|{config_str}"
    return short_hash(seed)


@router.get("/api/v1/health")
async def health() -> Dict[str, Any]:
    return {
        "status": "ok",
        "time": now_iso(),
        "llm_provider": LLM_PROVIDER,
        "openai_configured": bool(OPENAI_API_KEY),
        "openai_base_url": DEFAULT_OPENAI_BASE_URL,
        "default_model": DEFAULT_MODEL,
        "gemini_configured": bool(GEMINI_API_KEY),
        "gemini_base_url": GEMINI_BASE_URL,
        "gemini_model": GEMINI_MODEL,
    }

@router.post("/api/v1/analyze", response_model=AnalyzeResponse)
async def analyze(request: AnalyzeRequest):
    if not request.url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="url must start with http:// or https://")

    key = cache_key_for(request)
    now = time.time()
    # Check cache
    cached = cache.get(key)
    if cached and now - cached["timestamp"] < CACHE_TTL:
        return cached["response"]
    # Otherwise, classify
    response = classify_text(request.text, request.url, request.config)
    cache[key] = {"response": response, "timestamp": now}
    return response


@router.post("/api/v1/batchAnalyze")
async def batch_analyze(request: BatchAnalyzeRequest):
    results = []
    for doc in request.documents:
        key = cache_key_for(doc)
        now = time.time()
        cached = cache.get(key)
        if cached and now - cached["timestamp"] < CACHE_TTL:
            results.append(cached["response"])
            continue
        response = classify_text(doc.text, doc.url, doc.config)
        cache[key] = {"response": response, "timestamp": now}
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
