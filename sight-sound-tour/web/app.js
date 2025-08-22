// --- config ---
const apiBase = (window.API_BASE || "").replace(/\/$/, "");
const analysisPre = document.getElementById("analysis");
const translationPre = document.getElementById("translation");
let lastText = "";

// --- helpers ---
function showError(where, err, extra) {
  console.error(where, err, extra || "");
  alert(`${where}: ${err?.message || err}`);
}

async function analyzeFromUrl(imageUrl) {
  const res = await fetch(`${apiBase}/api/analyze?features=caption,objects,read&imageUrl=${encodeURIComponent(imageUrl)}`, { method: "POST" });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

async function analyzeFromBlob(blob) {
  const res = await fetch(`${apiBase}/api/analyze?features=caption,objects,ocr`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: blob
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

function extractText(data) {
  const caption = data?.captionResult?.text || data?.caption?.text || "";
  const ocr = (data?.readResult?.content || data?.ocrResult?.text || "").trim();
  return caption || ocr || `${caption} ${ocr}`.trim();
}

// --- upload/URL handler ---
document.getElementById("imgForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const imageUrl = document.getElementById("imageUrl").value.trim();
    const file = document.getElementById("file").files[0];

    let data;
    if (imageUrl) {
      data = await analyzeFromUrl(imageUrl);
    } else if (file) {
      data = await analyzeFromBlob(file); // send raw bytes
    } else {
      alert("Provide an image URL or choose a file.");
      return;
    }

    analysisPre.textContent = JSON.stringify(data, null, 2);
    lastText = extractText(data);
  } catch (err) {
    showError("Analyze", err);
  }
});

// --- camera support ---
const cameraSelect = document.getElementById("cameraSelect");
const startCamBtn = document.getElementById("startCamBtn");
const stopCamBtn = document.getElementById("stopCamBtn");
const captureBtn = document.getElementById("captureBtn");
const video = document.getElementById("preview");
const canvas = document.getElementById("snap");
let mediaStream;

async function listCameras() {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  const devices = await navigator.mediaDevices.enumerateDevices();
  const cams = devices.filter(d => d.kind === "videoinput");
  cameraSelect.innerHTML = "";
  cams.forEach((d, i) => {
    const opt = document.createElement("option");
    opt.value = d.deviceId;
    opt.textContent = d.label || `Camera ${i + 1}`;
    cameraSelect.appendChild(opt);
  });
}

async function startCamera() {
  const deviceId = cameraSelect.value || undefined;
  const constraints = deviceId
    ? { video: { deviceId: { exact: deviceId } } }
    : { video: { facingMode: "environment" } };
  mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
  video.srcObject = mediaStream;
  video.style.display = "block";
  captureBtn.disabled = false;
  stopCamBtn.disabled = false;
  startCamBtn.disabled = true;
}

function stopCamera() {
  if (mediaStream) mediaStream.getTracks().forEach(t => t.stop());
  mediaStream = null;
  video.srcObject = null;
  video.style.display = "none";
  captureBtn.disabled = true;
  stopCamBtn.disabled = true;
  startCamBtn.disabled = false;
}

async function captureAndAnalyze() {
  try {
    if (!video.videoWidth) throw new Error("Camera not ready yet.");
    const MAX_W = 1600;
    const scale = Math.min(1, MAX_W / video.videoWidth);
    const w = Math.round(video.videoWidth * scale);
    const h = Math.round(video.videoHeight * scale);
    canvas.width = w; canvas.height = h;
    canvas.getContext("2d").drawImage(video, 0, 0, w, h);
    const blob = await new Promise(res => canvas.toBlob(res, "image/jpeg", 0.85));
    const data = await analyzeFromBlob(blob);
    analysisPre.textContent = JSON.stringify(data, null, 2);
    lastText = extractText(data);
  } catch (err) {
    showError("Capture", err);
  }
}

if (navigator.mediaDevices?.getUserMedia) {
  listCameras().catch(() => {});
  startCamBtn.addEventListener("click", async () => { await startCamera(); await listCameras().catch(() => {}); });
  stopCamBtn.addEventListener("click", stopCamera);
  captureBtn.addEventListener("click", captureAndAnalyze);
} else {
  document.getElementById("file")?.setAttribute("capture", "environment");
}

// --- translate & tts ---
document.getElementById("translateBtn").addEventListener("click", async () => {
  try {
    const to = document.getElementById("toLang").value || "en";
    const res = await fetch(`${apiBase}/api/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: lastText, to })
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const data = await res.json();
    translationPre.textContent = JSON.stringify(data, null, 2);
    lastText = data.translatedText || lastText;
  } catch (err) {
    showError("Translate", err);
  }
});

document.getElementById("ttsBtn").addEventListener("click", async () => {
  try {
    const voice = document.getElementById("voice").value || "en-US-JennyNeural";
    const res = await fetch(`${apiBase}/api/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: lastText, voice })
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = document.getElementById("player");
    audio.src = url; audio.play();
  } catch (err) {
    showError("TTS", err);
  }
});
