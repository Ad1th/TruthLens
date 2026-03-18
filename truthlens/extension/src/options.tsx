import React from "react";

const Options = () => {
  // TODO: Implement sensitivity slider, heuristics-only toggle, provider endpoint input, export options
  return (
    <div style={{ minWidth: 320, padding: 20 }}>
      <h2>TruthLens Options</h2>
      <label>
        Sensitivity:
        <input type="range" min="1" max="3" defaultValue="2" />
      </label>
      <br />
      <label>
        <input type="checkbox" /> Heuristics-only mode
      </label>
      <br />
      <label>
        Provider endpoint:
        <input type="text" placeholder="https://your-backend.com/api" />
      </label>
      <br />
      <button>Export Flags</button>
    </div>
  );
};

export default Options;
