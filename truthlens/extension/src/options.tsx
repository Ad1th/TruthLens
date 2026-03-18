import React from "react";
import { createRoot } from "react-dom/client";

const Options = () => {
  const [sensitivity, setSensitivity] = React.useState("2");
  const [heuristicsOnly, setHeuristicsOnly] = React.useState(false);
  const [apiUrl, setApiUrl] = React.useState(
    "http://127.0.0.1:8000/api/v1/analyze",
  );

  React.useEffect(() => {
    chrome.storage.local
      .get([
        "truthlens_sensitivity",
        "truthlens_heuristics_only",
        "truthlens_api_url",
      ])
      .then((stored) => {
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
    await chrome.storage.local.set({
      truthlens_sensitivity: sensitivity,
      truthlens_heuristics_only: heuristicsOnly,
      truthlens_api_url: apiUrl,
    });
  }

  return (
    <div style={{ minWidth: 320, padding: 20 }}>
      <h2>TruthLens Options</h2>
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
      <button onClick={saveSettings}>Save Settings</button>
    </div>
  );
};

const rootEl = document.getElementById("root");
if (rootEl) {
  createRoot(rootEl).render(<Options />);
}

export default Options;
