(async () => {
  async function waitForGlobal(name, timeout = 5000, interval = 100) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (window[name]) return window[name];
      // eslint-disable-next-line no-await-in-loop
      await new Promise(r => setTimeout(r, interval));
    }
    return null;
  }

  if (!window.Tesseract) {
    // The page script runs in page context and cannot call chrome.runtime.
    // `content.js` should inject `libs/tesseract.min.js` before this script.
    const lib = await waitForGlobal("Tesseract", 5000, 100);
    if (!lib) {
      console.error(
        "Tesseract not available in page. Ensure the extension injected libs/tesseract.min.js"
      );
      return;
    }
  }

  console.log("Tesseract available in PAGE");

  const target =
    document.querySelector("canvas") ||
    document.querySelector("img");

  if (!target) return;

  let result;
  try {
    result = await Tesseract.recognize(target, "eng");
  } catch (err) {
    console.error("Tesseract.recognize failed:", err);
    return;
  }

  const words = result.data.words.map(w => ({
    text: w.text,
    x0: w.bbox.x0,
    y0: w.bbox.y0,
    x1: w.bbox.x1,
    y1: w.bbox.y1
  }));

  window.postMessage({ type: "OCR_RESULT", words }, "*");
})();
