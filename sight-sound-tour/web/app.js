const apiBase = (window.API_BASE || "").replace(/\/$/, ""); // set via your hosting if needed
const analysisPre = document.getElementById("analysis");
const translationPre = document.getElementById("translation");
let lastText = "";

document.getElementById("imgForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const imageUrl = document.getElementById("imageUrl").value.trim();
  const file = document.getElementById("file").files[0];

  let res;
  if (imageUrl) {
    res = await fetch(`${apiBase}/api/analyze?imageUrl=${encodeURIComponent(imageUrl)}`, { method: "POST" });
  } else if (file) {
    const fd = new FormData();
    fd.append("file", file);
    res = await fetch(`${apiBase}/api/analyze`, { method: "POST", body: fd });
  } else {
    alert("Provide an image URL or choose a file.");
    return;
  }

  const data = await res.json();
  analysisPre.textContent = JSON.stringify(data, null, 2);

  const caption = data?.captionResult?.text || data?.caption?.text || "";
  const ocr = (data?.readResult?.content || data?.ocrResult?.text || "").trim();
  // prefer caption; if no caption, use OCR; if both, combine
  lastText = caption || ocr || `${caption} ${ocr}`.trim();
});

document.getElementById("translateBtn").addEventListener("click", async () => {
  const to = document.getElementById("toLang").value || "en";
  const res = await fetch(`${apiBase}/api/translate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: lastText, to })
  });
  const data = await res.json();
  translationPre.textContent = JSON.stringify(data, null, 2);
  lastText = data.translatedText || lastText;
});

document.getElementById("ttsBtn").addEventListener("click", async () => {
  const voice = document.getElementById("voice").value || "en-US-JennyNeural";
  const res = await fetch(`${apiBase}/api/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: lastText, voice })
  });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const audio = document.getElementById("player");
  audio.src = url;
  audio.play();
});
