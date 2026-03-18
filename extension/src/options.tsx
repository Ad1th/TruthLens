import React from "react";
import { createRoot } from "react-dom/client";

const Options = () => {
  const [enabled, setEnabled] = React.useState(true);
  const [sensitivity, setSensitivity] = React.useState("2");
  const [heuristicsOnly, setHeuristicsOnly] = React.useState(false);
  const [apiUrl, setApiUrl] = React.useState(
    "http://127.0.0.1:8000/api/v1/analyze",
  );
  const [saveState, setSaveState] = React.useState("");
  const [healthState, setHealthState] = React.useState("Unknown");

  React.useEffect(() => {
    chrome.storage.local
      .get([
        "truthlens_enabled",
        "truthlens_sensitivity",
        "truthlens_heuristics_only",
        "truthlens_api_url",
      ])
      .then((stored) => {
        if (typeof stored.truthlens_enabled === "boolean") {
          setEnabled(stored.truthlens_enabled);
        }
        if (stored.truthlens_sensitivity) {
          setSensitivity(String(stored.truthlens_sensitivity));
        }
        if (typeof stored.truthlens_heuristics_only === "boolean") {
          setHeuristicsOnly(stored.truthlens_heuristics_only);
        }
        if (stored.truthlens_api_url) {
          setApiUrl(stored.truthlens_api_url);
        }
      });
  }, []);

  async function saveSettings() {
    setSaveState("");
    await chrome.storage.local.set({
      truthlens_enabled: enabled,
      truthlens_sensitivity: sensitivity,
      truthlens_heuristics_only: heuristicsOnly,
      truthlens_api_url: apiUrl,
    });
    setSaveState("Saved");
  }

  async function checkBackend() {
    setHealthState("Checking...");
    const healthUrl = apiUrl.replace(/\/api\/v1\/analyze$/, "/api/v1/health");
    try {
      const resp = await fetch(healthUrl, { method: "GET" });
      setHealthState(resp.ok ? "Online" : "Offline");
    } catch {
      setHealthState("Offline");
    }
  }

  return (
    <div style={{ minWidth: 320, padding: 20 }}>
      <h2>TruthLens Options</h2>
      <label>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />{" "}
        Enable analysis
      </label>
      <br />
      <label>
        Sensitivity:
        <input
          type="range"
          min="1"
          max="3"
          value={sensitivity}
          onChange={(e) => setSensitivity(e.target.value)}
        />
      </label>
      <br />
      <label>
        <input
          type="checkbox"
          checked={heuristicsOnly}
          onChange={(e) => setHeuristicsOnly(e.target.checked)}
        />{" "}
        Heuristics-only mode
      </label>
      <br />
      <label>
        Provider endpoint:
        <input
          type="text"
          value={apiUrl}
          onChange={(e) => setApiUrl(e.target.value)}
          placeholder="https://your-backend.com/api/v1/analyze"
          style={{ width: "100%" }}
        />
      </label>
      <br />
      <div style={{ marginBottom: 10 }}>Backend status: {healthState}</div>
      <button onClick={checkBackend}>Check Backend</button>{" "}
      <button onClick={saveSettings}>Save Settings</button>
      <span style={{ marginLeft: 10 }}>{saveState}</span>
    </div>
  );
};

const rootEl = document.getElementById("root");
if (rootEl) {
  createRoot(rootEl).render(<Options />);
}

export default Options;
