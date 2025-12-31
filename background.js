chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  console.log('background <- message', msg?.type, msg?.word);
  if (msg.type === "AI_MEANING") {
    // Use the Gemini client request shape (model + contents). Keep using REST fetch
    // Note: the API key is still passed in the URL here; consider moving it to secure storage.
    const apiKey = "AIzaSyCAHmsFG2kTbOrls3_ycRw7oVUZl9BBNi8";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const body = {
      model: "gemini-2.5-flash",
      contents: `Explain the word \"${msg.word}\" in very simple English.`
    };

    console.log('background -> Gemini request', url, body);

    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    })
      .then((res) => {
        console.log('background <- Gemini raw status', res.status);
        return res.json().catch(err => {
          console.error('background <- JSON parse error', err);
          return null;
        });
      })
      .then((data) => {
        console.log('background <- Gemini data', data);
        // support multiple response shapes
        const meaning =
          data?.candidates?.[0]?.content?.parts?.[0]?.text ||
          data?.output?.[0]?.content?.text ||
          data?.text ||
          data?.candidates?.[0]?.text ||
          "Meaning not found";

        console.log('background -> meaning', meaning);
        sendResponse({ meaning });
      })
      .catch((err) => {
        console.error("Gemini request failed:", err);
        sendResponse({ meaning: "Error fetching meaning" });
      });

    return true; // IMPORTANT
  }
});
