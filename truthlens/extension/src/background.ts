// background.ts
// Chrome extension background service worker for TruthLens
// 1. Debounces requests for the same URL
// 2. Calls backend /api/v1/analyze
// 3. Caches responses in chrome.storage.local for 24h
// 4. Sends analysis results to content script

// Types
interface AnalysisRequest {
  type: "REQUEST_ANALYSIS";
  url: string;
  text: string;
  pageHash: string;
}

interface AnalysisResponse {
  overall_bias_score: number;
  confidence: number;
  flags: any[];
  meta: any;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const API_URL = "https://your-backend.com/api/v1/analyze"; // TODO: Set real backend URL

// Debounce map
const debounceTimers: Record<string, number> = {};

chrome.runtime.onMessage.addListener(
  (msg: AnalysisRequest, sender, sendResponse) => {
    if (msg.type !== "REQUEST_ANALYSIS") return;
    const { url, text, pageHash } = msg;

    // Debounce by pageHash
    if (debounceTimers[pageHash]) {
      clearTimeout(debounceTimers[pageHash]);
    }
    debounceTimers[pageHash] = window.setTimeout(() => {
      handleAnalysisRequest(url, text, pageHash, sender.tab?.id);
      delete debounceTimers[pageHash];
    }, 500); // 500ms debounce
  },
);

async function handleAnalysisRequest(
  url: string,
  text: string,
  pageHash: string,
  tabId?: number,
) {
  // Check cache
  const cacheKey = `truthlens_${pageHash}`;
  const cache = await chrome.storage.local.get(cacheKey);
  const cached = cache[cacheKey];
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    sendAnalysisResult(tabId, cached.data);
    return;
  }

  // Call backend
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        text,
        config: { sensitivity: "medium", lang: "en" },
      }),
    });
    if (!res.ok) throw new Error("Backend error");
    const data: AnalysisResponse = await res.json();
    // Cache result
    await chrome.storage.local.set({
      [cacheKey]: { data, timestamp: Date.now() },
    });
    sendAnalysisResult(tabId, data);
  } catch (e) {
    // Error handling
    sendAnalysisResult(tabId, {
      overall_bias_score: 0,
      confidence: 0,
      flags: [],
      meta: { error: e.message },
    });
  }
}

function sendAnalysisResult(tabId: number | undefined, data: AnalysisResponse) {
  if (!tabId) return;
  chrome.tabs.sendMessage(tabId, { type: "ANALYSIS_RESULT", ...data });
}

// TODO: Add error reporting, batchAnalyze, and feedback endpoints
