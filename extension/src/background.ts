// background.ts
// Chrome extension background service worker for TruthLens
// 1. Debounces requests for the same URL
// 2. Calls backend /api/v1/analyze
// 3. Caches responses in chrome.storage.local for 24h
// 4. Sends analysis results to content script

interface AnalysisRequest {
  type: "REQUEST_ANALYSIS";
  url: string;
  text: string;
  pageHash: string;
}

interface GetStatusRequest {
  type: "GET_STATUS";
}

interface SetEnabledRequest {
  type: "SET_ENABLED";
  enabled: boolean;
  tabId?: number;
}

type RuntimeMessage = AnalysisRequest | GetStatusRequest | SetEnabledRequest;

interface AnalysisResponse {
  overall_bias_score: number;
  confidence: number;
  flags: any[];
  meta: any;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const API_URL = "http://127.0.0.1:8000/api/v1/analyze";
const DEFAULT_ENABLED = true;
const DEFAULT_SENSITIVITY = "2";
const DEFAULT_HEURISTICS_ONLY = false;

// Debounce map
const debounceTimers: Record<string, number> = {};

async function getRuntimeSettings() {
  const stored = await chrome.storage.local.get([
    "truthlens_enabled",
    "truthlens_sensitivity",
    "truthlens_heuristics_only",
  ]);

  return {
    enabled:
      typeof stored.truthlens_enabled === "boolean"
        ? stored.truthlens_enabled
        : DEFAULT_ENABLED,
    sensitivity: String(stored.truthlens_sensitivity || DEFAULT_SENSITIVITY),
    heuristicsOnly:
      typeof stored.truthlens_heuristics_only === "boolean"
        ? stored.truthlens_heuristics_only
        : DEFAULT_HEURISTICS_ONLY,
  };
}

async function getApiUrl(): Promise<string> {
  const result = await chrome.storage.local.get("truthlens_api_url");
  return result.truthlens_api_url || API_URL;
}

chrome.runtime.onMessage.addListener(
  (msg: RuntimeMessage, sender, sendResponse) => {
    if (msg.type === "GET_STATUS") {
      (async () => {
        const [settings, apiUrl, lastResultStore] = await Promise.all([
          getRuntimeSettings(),
          getApiUrl(),
          chrome.storage.local.get("truthlens_last_result"),
        ]);

        sendResponse({
          ok: true,
          enabled: settings.enabled,
          sensitivity: settings.sensitivity,
          heuristicsOnly: settings.heuristicsOnly,
          apiUrl,
          lastResult: lastResultStore.truthlens_last_result || null,
        });
      })();
      return true;
    }

    if (msg.type === "SET_ENABLED") {
      (async () => {
        await chrome.storage.local.set({ truthlens_enabled: msg.enabled });
        if (typeof msg.tabId === "number") {
          chrome.tabs.sendMessage(msg.tabId, {
            type: "TRUTHLENS_TOGGLE",
            enabled: msg.enabled,
          });
        }
        sendResponse({ ok: true });
      })();
      return true;
    }

    if (msg.type !== "REQUEST_ANALYSIS") return;
    const { url, text, pageHash } = msg;

    // Debounce by pageHash
    if (debounceTimers[pageHash]) {
      clearTimeout(debounceTimers[pageHash]);
    }
    debounceTimers[pageHash] = setTimeout(() => {
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
  const settings = await getRuntimeSettings();
  if (!settings.enabled) {
    sendAnalysisResult(tabId, {
      overall_bias_score: 0,
      confidence: 0,
      flags: [],
      meta: { disabled: true },
    });
    return;
  }

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
    const apiUrl = await getApiUrl();
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        text: text.slice(0, 20000),
        config: {
          sensitivity: settings.sensitivity,
          heuristics_only: settings.heuristicsOnly,
          lang: "en",
        },
      }),
    });
    if (!res.ok) throw new Error("Backend error");
    const data: AnalysisResponse = await res.json();
    // Cache result
    await chrome.storage.local.set({
      [cacheKey]: { data, timestamp: Date.now() },
      truthlens_last_result: {
        timestamp: Date.now(),
        url,
        overall_bias_score: data.overall_bias_score,
        confidence: data.confidence,
        flags_count: Array.isArray(data.flags) ? data.flags.length : 0,
        provider: data.meta?.provider || "unknown",
      },
    });
    sendAnalysisResult(tabId, data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    // Error handling
    sendAnalysisResult(tabId, {
      overall_bias_score: 0,
      confidence: 0,
      flags: [],
      meta: { error: message },
    });
  }
}

function sendAnalysisResult(tabId: number | undefined, data: AnalysisResponse) {
  if (!tabId) return;
  chrome.tabs.sendMessage(tabId, { type: "ANALYSIS_RESULT", ...data });
}

// TODO: Add error reporting, batchAnalyze, and feedback endpoints
