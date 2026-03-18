import React from "react";
import { createRoot } from "react-dom/client";

type LastResult = {
  timestamp: number;
  url: string;
  overall_bias_score: number;
  confidence: number;
  flags_count: number;
  provider: string;
};

const Popup = () => {
  const [enabled, setEnabled] = React.useState(true);
  const [apiUrl, setApiUrl] = React.useState(
    "http://127.0.0.1:8000/api/v1/analyze",
  );
  const [backendOnline, setBackendOnline] = React.useState(false);
  const [lastResult, setLastResult] = React.useState<LastResult | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    (async () => {
      try {
        const status = await chrome.runtime.sendMessage({ type: "GET_STATUS" });
        if (status?.ok) {
          setEnabled(Boolean(status.enabled));
          setApiUrl(String(status.apiUrl || apiUrl));
          setLastResult(status.lastResult || null);
        }
      } catch {
        setError("Could not read extension state.");
      }
    })();
  }, []);

  React.useEffect(() => {
    (async () => {
      try {
        const healthUrl = apiUrl.replace(
          /\/api\/v1\/analyze$/,
          "/api/v1/health",
        );
        const resp = await fetch(healthUrl, { method: "GET" });
        setBackendOnline(resp.ok);
      } catch {
        setBackendOnline(false);
      }
    })();
  }, [apiUrl]);

  async function onToggle(next: boolean) {
    setIsSaving(true);
    setError("");
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      await chrome.runtime.sendMessage({
        type: "SET_ENABLED",
        enabled: next,
        tabId: tab?.id,
      });
      setEnabled(next);
    } catch {
      setError("Failed to toggle analysis.");
    } finally {
      setIsSaving(false);
    }
  }

  const formattedTime = lastResult?.timestamp
    ? new Date(lastResult.timestamp).toLocaleString()
    : "--";

  return (
    <div
      style={{
        minWidth: 320,
        padding: 16,
        fontFamily: "ui-sans-serif, system-ui",
      }}
    >
      <h2 style={{ margin: "0 0 12px" }}>TruthLens</h2>

      <label
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
          padding: "10px 12px",
          border: "1px solid #e5e7eb",
          borderRadius: 10,
        }}
      >
        <span>Enable Analysis</span>
        <input
          type="checkbox"
          checked={enabled}
          disabled={isSaving}
          onChange={(e) => onToggle(e.target.checked)}
          aria-label="Enable analysis"
        />
      </label>

      <div style={{ marginBottom: 8 }}>
        Backend: {backendOnline ? "Online" : "Offline"}
      </div>
      <div style={{ marginBottom: 8, color: "#4b5563", fontSize: 12 }}>
        {apiUrl}
      </div>

      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 10,
          padding: 12,
          background: "#f9fafb",
        }}
      >
        <div style={{ marginBottom: 6 }}>
          Bias Score: <strong>{lastResult?.overall_bias_score ?? "--"}</strong>
        </div>
        <div style={{ marginBottom: 6 }}>
          Confidence:{" "}
          <strong>
            {lastResult ? `${Math.round(lastResult.confidence * 100)}%` : "--"}
          </strong>
        </div>
        <div style={{ marginBottom: 6 }}>
          Flags: <strong>{lastResult?.flags_count ?? "--"}</strong>
        </div>
        <div style={{ marginBottom: 6 }}>
          Provider: <strong>{lastResult?.provider || "--"}</strong>
        </div>
        <div style={{ fontSize: 12, color: "#6b7280" }}>
          Last analyzed: {formattedTime}
        </div>
      </div>

      {error ? (
        <div style={{ marginTop: 10, color: "#b91c1c" }}>{error}</div>
      ) : null}

      <button
        onClick={() => chrome.runtime.openOptionsPage()}
        style={{
          marginTop: 12,
          width: "100%",
          border: "1px solid #d1d5db",
          borderRadius: 8,
          background: "white",
          padding: "8px 10px",
          cursor: "pointer",
        }}
      >
        Open Settings
      </button>
    </div>
  );
};

const rootEl = document.getElementById("root");
if (rootEl) {
  createRoot(rootEl).render(<Popup />);
}

export default Popup;
