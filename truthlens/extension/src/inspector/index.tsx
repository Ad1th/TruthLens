import React from "react";

const Inspector = () => {
  // TODO: Show flag details, explanation, rewrite, citations, feedback controls
  return (
    <div style={{ minWidth: 250, padding: 12 }}>
      <h3>Flag Details</h3>
      <div id="flag-type">Type: --</div>
      <div id="flag-explanation">Explanation: --</div>
      <div id="flag-rewrite">Suggested Rewrite: --</div>
      {/* TODO: Add citations and feedback controls */}
    </div>
  );
};

export default Inspector;
