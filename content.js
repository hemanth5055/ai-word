let ocrWords = [];
let popup;

/* ---------- INJECT PAGE SCRIPT ---------- */
function injectPageScript() {
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("page-ocr.js");
  const parent = document.head || document.documentElement || document.body;
  script.onload = () => console.log("page-ocr.js injected");
  script.onerror = () => console.error("Failed to inject page-ocr.js");
  parent.appendChild(script);
}

// Inject Tesseract into the page first, then inject the page script that uses it.
async function injectPageScript() {
  const parent = document.head || document.documentElement || document.body;
  async function tryInjectSrc(srcUrl) {
    return new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = srcUrl;
      s.onload = () => resolve({ ok: true, method: "src" });
      s.onerror = () => resolve({ ok: false });
      parent.appendChild(s);
    });
  }

  async function tryInjectWithBlob(path) {
    try {
      const res = await fetch(chrome.runtime.getURL(path));
      const text = await res.text();
      const blob = new Blob([text], { type: "text/javascript" });
      const blobUrl = URL.createObjectURL(blob);
      const r = await tryInjectSrc(blobUrl);
      if (r.ok) return { ok: true, method: "blob" };
    } catch (e) {
      console.error("Blob fallback failed:", e);
    }
    return { ok: false };
  }

  // 1) try direct extension URL
  const extUrl = chrome.runtime.getURL("libs/tesseract.min.js");
  let injected = await tryInjectSrc(extUrl);

  // 2) blob fallback if extension src is blocked or failed
  if (!injected.ok) {
    console.warn("tesseract extension src failed, trying blob fallback");
    injected = await tryInjectWithBlob("libs/tesseract.min.js");
  }

  if (injected.ok) {
    console.log(`tesseract.min.js injected (${injected.method})`);
  } else {
    console.error("Failed to inject tesseract.min.js (both src and blob fallback)");
  }

  // finally inject the page script
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("page-ocr.js");
  script.onload = () => console.log("page-ocr.js injected");
  script.onerror = () => console.error("Failed to inject page-ocr.js");
  parent.appendChild(script);
}

injectPageScript();

/* ---------- RECEIVE OCR DATA ---------- */
window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  if (event.data.type === "OCR_RESULT") {
    ocrWords = event.data.words;
    console.log("OCR words received:", ocrWords.length);
  }
});

/* ---------- CURSOR DETECTION ---------- */
// Try to get a word from the page text under the cursor; fall back to OCR words.
let lastQueriedWord = null;
let debounceTimer = null;

function getWordFromRange(range) {
  if (!range || !range.startContainer) return null;
  let node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) return null;
  const text = node.textContent;
  const offset = range.startOffset;
  if (!text || offset == null) return null;

  // expand to word boundaries
  const isWordChar = (ch) => /[\p{L}\p{M}'-]/u.test(ch);
  let start = offset - 1;
  while (start >= 0 && isWordChar(text[start])) start--;
  start++;
  let end = offset;
  while (end < text.length && isWordChar(text[end])) end++;

  const w = text.slice(start, end).trim();
  return w || null;
}

function wordAtPoint(x, y) {
  // Preferred modern API
  let range = null;
  if (document.caretPositionFromPoint) {
    try {
      const pos = document.caretPositionFromPoint(x, y);
      if (pos) {
        range = document.createRange();
        range.setStart(pos.offsetNode, pos.offset);
        range.setEnd(pos.offsetNode, pos.offset);
      }
    } catch (e) {
      range = null;
    }
  } else if (document.caretRangeFromPoint) {
    try {
      range = document.caretRangeFromPoint(x, y);
    } catch (e) {
      range = null;
    }
  }

  const w = getWordFromRange(range);
  if (w && w.length > 0) return w;
  return null;
}

function sendForMeaning(word, clientX, clientY) {
  if (!word || word.length < 2) return;
  if (word === lastQueriedWord) return;
  lastQueriedWord = word;

  console.log("content -> sending AI_MEANING", word);
  let responded = false;
  chrome.runtime.sendMessage({ type: "AI_MEANING", word }, (res) => {
    responded = true;
    console.log("content <- AI_MEANING response", res);
    if (res?.meaning) showPopup(res.meaning, clientX, clientY, word);
  });

  // diagnostic timeout if background doesn't respond
  setTimeout(() => {
    if (!responded) console.warn("No response from background for", word);
  }, 6000);
}

document.addEventListener("mousemove", (e) => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    // 1) Try page text
    const textWord = wordAtPoint(e.clientX, e.clientY);
    if (textWord) {
      sendForMeaning(textWord, e.clientX, e.clientY);
      return;
    }

    // 2) Fallback to OCR for images/canvas
    if (!ocrWords.length) return;

    const rect =
      document.querySelector("canvas")?.getBoundingClientRect() ||
      document.querySelector("img")?.getBoundingClientRect();

    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const ocrWord = ocrWords.find((w) =>
      x >= w.x0 && x <= w.x1 && y >= w.y0 && y <= w.y1 && w.text.length > 2
    );

    if (ocrWord) sendForMeaning(ocrWord.text, e.clientX, e.clientY);
  }, 160);
});

/* ---------- POPUP ---------- */
function showPopup(text, x, y, word) {
  if (popup) popup.remove();
  popup = document.createElement("div");
  popup.className = "ai-meaning-popup";
  const title = word ? `<div style="font-weight:600;margin-bottom:6px">${escapeHtml(word)}</div>` : "";
  popup.innerHTML = `
    ${title}
    <div style="font-size:13px;line-height:1.3;">${escapeHtml(text)}</div>
    <div style="text-align:right;margin-top:8px">
      <button class="ai-close" style="margin-right:6px;padding:4px 6px;font-size:12px">Close</button>
      <button class="ai-pin" style="padding:4px 6px;font-size:12px">Pin</button>
    </div>
  `;

  Object.assign(popup.style, {
    position: "fixed",
    top: `${y + 12}px`,
    left: `${x + 12}px`,
    background: "#111",
    color: "#fff",
    padding: "10px",
    borderRadius: "8px",
    maxWidth: "320px",
    fontSize: "13px",
    zIndex: 2147483647,
    boxShadow: "0 6px 18px rgba(0,0,0,0.4)",
  });

  let pinned = false;
  const removePopup = () => {
    if (popup) {
      popup.remove();
      popup = null;
    }
  };

  document.body.appendChild(popup);

  const closeBtn = popup.querySelector(".ai-close");
  const pinBtn = popup.querySelector(".ai-pin");

  closeBtn?.addEventListener("click", () => removePopup());
  pinBtn?.addEventListener("click", () => {
    pinned = !pinned;
    pinBtn.textContent = pinned ? "Unpin" : "Pin";
  });

  // auto-remove after delay if not pinned
  setTimeout(() => {
    if (!pinned) removePopup();
  }, 6000);
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ---------- Manual test button (forces a request for the hovered word) ----------
let lastMouseX = 0;
let lastMouseY = 0;
document.addEventListener("mousemove", (e) => {
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
});

function sendCurrentWordManual() {
  const w = wordAtPoint(lastMouseX, lastMouseY) || lastQueriedWord;
  if (!w) {
    showPopup("No word found under cursor", lastMouseX, lastMouseY);
    return;
  }

  const btn = document.getElementById("ai-manual-define-btn");
  if (window.__manualRequestInFlight) {
    return;
  }
  window.__manualRequestInFlight = true;
  if (btn) btn.disabled = true;

  console.log("manual -> sending AI_MEANING", w);
  // show immediate fetching feedback
  showPopup("Fetching meaning...", lastMouseX, lastMouseY, w);

  try {
    chrome.runtime.sendMessage({ type: "AI_MEANING", word: w }, (res) => {
      // handle runtime errors from extension (e.g., context invalidated)
      if (chrome.runtime.lastError) {
        console.warn("manual <- sendMessage error", chrome.runtime.lastError.message);
        showPopup("Extension unavailable — please reload the extension.", lastMouseX, lastMouseY);
      } else {
        console.log("manual <- AI_MEANING response", res);
        if (res?.meaning) showPopup(res.meaning, lastMouseX, lastMouseY, w);
        else showPopup("No meaning found", lastMouseX, lastMouseY, w);
      }
      window.__manualRequestInFlight = false;
      if (btn) btn.disabled = false;
    });
  } catch (err) {
    console.error("manual sendMessage threw:", err);
    showPopup("Extension context invalidated.", lastMouseX, lastMouseY);
    window.__manualRequestInFlight = false;
    if (btn) btn.disabled = false;
  }
}

function createManualButton() {
  try {
    const btn = document.createElement("button");
    btn.id = "ai-manual-define-btn";
    btn.textContent = "Define";
    btn.title = "Click to fetch meaning for word under cursor";
    Object.assign(btn.style, {
      position: "fixed",
      right: "12px",
      bottom: "12px",
      zIndex: 2147483647,
      padding: "8px 12px",
      borderRadius: "8px",
      background: "#111",
      color: "#fff",
      border: "none",
      cursor: "pointer",
      fontSize: "13px",
      boxShadow: "0 6px 18px rgba(0,0,0,0.25)",
    });
    btn.addEventListener("click", sendCurrentWordManual);
    document.body.appendChild(btn);
  } catch (e) {
    console.warn("Could not create manual define button:", e);
  }
}

createManualButton();
