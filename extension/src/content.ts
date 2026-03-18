// content.ts
// Chrome extension content script for TruthLens
// 1. Extracts visible page text (ignores scripts/styles)
// 2. Computes a short page hash
// 3. Sends message to background for analysis
// 4. Receives analysis response and highlights spans
// 5. Attaches click handlers to highlights to open inspector

type Citation = {
  title: string;
  url: string;
  score: number;
};

type AnalysisFlag = {
  id: string;
  span: string;
  context: string;
  type: string;
  explanation: string;
  confidence: number;
  suggested_rewrite?: string;
  citations?: Citation[];
};

type AnalysisMessage = {
  type: "ANALYSIS_RESULT";
  overall_bias_score: number;
  confidence: number;
  flags: AnalysisFlag[];
  meta?: Record<string, unknown>;
};

let styleInjected = false;
const highlightElements: HTMLElement[] = [];
let inspectorHost: HTMLElement | null = null;

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

function injectStyles() {
  if (styleInjected) return;
  const style = document.createElement("style");
  style.textContent = `
    .truthlens-highlight {
      background: rgba(239, 68, 68, 0.16);
      border-bottom: 2px solid rgba(220, 38, 38, 0.9);
      border-radius: 2px;
      cursor: pointer;
      transition: background 120ms ease;
    }
    .truthlens-highlight:hover {
      background: rgba(245, 158, 11, 0.22);
    }
  `;
  document.head.appendChild(style);
  styleInjected = true;
}

function clearHighlights() {
  for (const el of highlightElements) {
    const parent = el.parentNode;
    if (!parent) continue;
    parent.replaceChild(document.createTextNode(el.textContent || ""), el);
    parent.normalize();
  }
  highlightElements.length = 0;
}

function findTextNodeMatch(
  target: string,
): { node: Text; start: number } | null {
  const normalizedTarget = target.trim();
  if (!normalizedTarget) return null;

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
        ) {
          return NodeFilter.FILTER_REJECT;
        }
        const text = node.textContent || "";
        return text.trim()
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      },
    },
  );

  let node: Node | null;
  while ((node = walker.nextNode())) {
    const textNode = node as Text;
    const haystack = textNode.textContent || "";
    const start = haystack
      .toLowerCase()
      .indexOf(normalizedTarget.toLowerCase());
    if (start >= 0) {
      return { node: textNode, start };
    }
  }
  return null;
}

function getOrCreateInspectorHost(): ShadowRoot {
  if (!inspectorHost) {
    inspectorHost = document.createElement("div");
    inspectorHost.id = "truthlens-inspector-host";
    document.body.appendChild(inspectorHost);
  }
  const shadow =
    inspectorHost.shadowRoot || inspectorHost.attachShadow({ mode: "open" });
  return shadow;
}

function openInspector(flag: AnalysisFlag) {
  const shadow = getOrCreateInspectorHost();
  shadow.innerHTML = `
    <style>
      .card {
        position: fixed;
        right: 16px;
        bottom: 16px;
        width: min(420px, calc(100vw - 32px));
        z-index: 2147483646;
        font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #111827;
        background: #ffffff;
        border: 1px solid #e5e7eb;
        border-radius: 12px;
        box-shadow: 0 12px 28px rgba(0, 0, 0, 0.18);
        padding: 14px;
      }
      .title { font-weight: 700; margin: 0 0 8px; }
      .row { margin: 6px 0; }
      .label { font-weight: 600; }
      .close {
        float: right;
        border: 0;
        background: transparent;
        cursor: pointer;
        font-size: 16px;
      }
      a { color: #1d4ed8; text-decoration: none; }
      a:hover { text-decoration: underline; }
    </style>
    <div class="card" role="dialog" aria-label="TruthLens explanation">
      <button class="close" id="truthlens-close" aria-label="Close">x</button>
      <div class="title">TruthLens Insight</div>
      <div class="row"><span class="label">Type:</span> ${flag.type}</div>
      <div class="row"><span class="label">Confidence:</span> ${(flag.confidence * 100).toFixed(0)}%</div>
      <div class="row"><span class="label">Explanation:</span> ${flag.explanation}</div>
      <div class="row"><span class="label">Rewrite:</span> ${flag.suggested_rewrite || "N/A"}</div>
      <div class="row" id="truthlens-citations"></div>
    </div>
  `;

  const citationsEl = shadow.getElementById("truthlens-citations");
  if (citationsEl) {
    if (flag.citations && flag.citations.length > 0) {
      citationsEl.innerHTML = `<span class="label">Citations:</span> ${flag.citations
        .slice(0, 3)
        .map(
          (c) =>
            `<a href="${c.url}" target="_blank" rel="noopener noreferrer">${c.title}</a>`,
        )
        .join(" · ")}`;
    } else {
      citationsEl.innerHTML = `<span class="label">Citations:</span> None`;
    }
  }

  const closeButton = shadow.getElementById("truthlens-close");
  closeButton?.addEventListener("click", () => {
    if (inspectorHost) {
      inspectorHost.remove();
      inspectorHost = null;
    }
  });
}

// Highlight flagged spans using Range/TreeWalker
function highlightSpans(flags: AnalysisFlag[]) {
  injectStyles();
  clearHighlights();

  for (const flag of flags) {
    const match = findTextNodeMatch(flag.span);
    if (!match) continue;

    const range = document.createRange();
    const end = Math.min(match.node.length, match.start + flag.span.length);
    if (end <= match.start) continue;

    range.setStart(match.node, match.start);
    range.setEnd(match.node, end);

    const wrapper = document.createElement("span");
    wrapper.className = "truthlens-highlight";
    wrapper.dataset.truthlensId = flag.id;
    wrapper.title = flag.explanation;
    wrapper.addEventListener("click", () => openInspector(flag));

    try {
      range.surroundContents(wrapper);
      highlightElements.push(wrapper);
    } catch {
      // Skip invalid ranges that cross node boundaries.
    }
  }
}

// Listen for messages from background (analysis results)
chrome.runtime.onMessage.addListener((msg: AnalysisMessage) => {
  if (msg.type === "ANALYSIS_RESULT" && Array.isArray(msg.flags)) {
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
