chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  console.log('background <- message', msg?.type, msg?.word);

  if (msg.type !== "AI_MEANING") return;

  const word = (msg.word || "").trim();
  if (!word) {
    sendResponse({ meaning: "No word supplied" });
    return true;
  }

  const apiKey = "AIzaSyCAHmsFG2kTbOrls3_ycRw7oVUZl9BBNi8";
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const body = {
    model: "gemini-2.5-flash",
    contents: [
      {
        parts: [
          {
            text: `Explain the word "${word}" in very simple English (only in one line).`
          }
        ]
      }
    ]
  };

  console.log('background -> Gemini request', url, body);

  (async () => {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        console.error("Gemini HTTP Error:", response.status, errorText);
        sendResponse({ meaning: "Error fetching meaning" });
        return;
      }

      const data = await response.json();
      console.log("API Response:", data);

      const meaning =
        data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
        data?.output?.[0]?.content?.text?.trim() ||
        data?.text?.trim() ||
        data?.candidates?.[0]?.text?.trim() ||
        "Meaning not found";

      console.log("Meaning:", meaning);
      sendResponse({ meaning });

    } catch (err) {
      console.error("Gemini request failed:", err);
      sendResponse({ meaning: "Error fetching meaning" });
    }
  })();

  return true;
});
