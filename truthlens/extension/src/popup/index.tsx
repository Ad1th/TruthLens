import React from "react";

const Popup = () => {
  // TODO: Fetch and display last analysis, bias score, and toggles
  return (
    <div style={{ minWidth: 300, padding: 16 }}>
      <h2>TruthLens</h2>
      <div>
        Bias Score: <span id="bias-score">--</span>
      </div>
      <button id="toggle-analysis">Toggle Analysis</button>
      {/* TODO: Add export and settings links */}
    </div>
  );
};

export default Popup;
