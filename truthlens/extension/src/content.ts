// content.ts
// Chrome extension content script for TruthLens
// 1. Extracts visible page text (ignores scripts/styles)
// 2. Computes a short page hash
// 3. Sends message to background for analysis
// 4. Receives analysis response and highlights spans
// 5. Attaches click handlers to highlights to open inspector

// TODO: Import types for messages and flags

// Utility: Extract visible text from DOM
function extractVisibleText(): string {
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        if (!node.parentElement) return NodeFilter.FILTER_REJECT;
        const tag = node.parentElement.tagName.toLowerCase();
        if (
          ["script", "style", "noscript", "iframe", "canvas", "svg"].includes(
            tag,
          )
        )
          return NodeFilter.FILTER_REJECT;
        if (!node.textContent || !node.textContent.trim())
          return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    },
  );
  let text = "";
  let node;
  while ((node = walker.nextNode())) {
    text += node.textContent + " ";
  }
  return text.trim();
}

// Utility: Simple hash (FNV-1a)
function hashString(str: string): string {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash +=
      (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(36);
}

// Send analysis request to background
async function requestAnalysis(text: string, url: string) {
  const pageHash = hashString(text);
  return chrome.runtime.sendMessage({
    type: "REQUEST_ANALYSIS",
    url,
    text,
    pageHash,
  });
}

// Highlight flagged spans using Range/TreeWalker
function highlightSpans(flags: any[]) {
  // TODO: Map span text/offsets to DOM nodes using Range/TreeWalker
  // For each flag, wrap the span in a <span data-truthlens-id=...>
  // Attach hover/click listeners to open inspector
}

// Listen for messages from background (analysis results)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "ANALYSIS_RESULT" && msg.flags) {
    highlightSpans(msg.flags);
  }
});

// Main: Extract, hash, and request analysis
(async function main() {
  const text = extractVisibleText();
  const url = window.location.href;
  await requestAnalysis(text, url);
})();

// TODO: Implement highlightSpans, inspector popup, and undo logic
