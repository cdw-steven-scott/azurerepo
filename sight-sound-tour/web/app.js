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
    res = await fetch(`${apiBase}/api/analyze?features=caption,objects,ocr&imageUrl=${encodeURIComponent(imageUrl)}`, {
      method: "POST"
    });
  } else if (file) {
    res = await fetch(`${apiBase}/api/analyze?features=caption,objects,ocr`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: file  // send raw bytes, NOT multipart
    });
  } else {
    alert("Provide an image URL or choose a file.");
    return;
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Analyze failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  analysisPre.textContent = JSON.stringify(data, null, 2);

  const caption = data?.captionResult?.text || data?.caption?.text || "";
  const ocr = (data?.readResult?.content || data?.ocrResult?.text || "").trim();
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

// ===== existing variables =====
const apiBase = (window.API_BASE || "").replace(/\/$/, "");
const analysisPre = document.getElementById("analysis");
const translationPre = document.getElementById("translation");
let lastText = "";

// ===== camera elements =====
const cameraSelect = document.getElementById("cameraSelect");
const startCamBtn = document.getElementById("startCamBtn");
const stopCamBtn = document.getElementById("stopCamBtn");
const captureBtn = document.getElementById("captureBtn");
const video = document.getElementById("preview");
const canvas = document.getElementById("snap");

let mediaStream;

// List cameras
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

// Start camera with selected device
async function startCamera() {
  try {
    const deviceId = cameraSelect.value || undefined;
    // Prefer environment (rear) camera when available
    const constraints = deviceId
      ? { video: { deviceId: { exact: deviceId } } }
      : { video: { facingMode: "environment" } };

    mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = mediaStream;
    video.style.display = "block";
    captureBtn.disabled = false;
    stopCamBtn.disabled = false;
    startCamBtn.disabled = true;
  } catch (e) {
    alert("Could not start camera: " + e);
  }
}

// Stop camera
function stopCamera() {
  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
  }
  video.srcObject = null;
  video.style.display = "none";
  captureBtn.disabled = true;
  stopCamBtn.disabled = true;
  startCamBtn.disabled = false;
}

// Capture frame → blob → send to /api/analyze
async function captureAndAnalyze() {
  if (!video.videoWidth) {
    alert("Camera not ready yet.");
    return;
  }

  // Optionally downscale to reduce payload & latency
  const MAX_W = 1600; // tweak for quality vs. size
  const scale = Math.min(1, MAX_W / video.videoWidth);
  const w = Math.round(video.videoWidth * scale);
  const h = Math.round(video.videoHeight * scale);

  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, w, h);

  // Export as JPEG (smaller) or PNG (lossless). 0.85 is a good balance.
  const blob = await new Promise(res => canvas.toBlob(res, "image/jpeg", 0.85));

  const fd = new FormData();
  fd.append("file", blob, "capture.jpg");

  const res = await fetch(`${apiBase}/api/analyze?features=caption,objects,ocr`, {
    method: "POST",
    body: fd
  });
  const data = await res.json();
  analysisPre.textContent = JSON.stringify(data, null, 2);

  const caption = data?.captionResult?.text || data?.caption?.text || "";
  const ocr = (data?.readResult?.content || data?.ocrResult?.text || "").trim();
  lastText = caption || ocr || `${caption} ${ocr}`.trim();
}

// ===== wire up events =====
if (navigator.mediaDevices?.getUserMedia) {
  // Request permissions quietly by listing devices after a dummy getUserMedia or on click
  listCameras().catch(() => {});
  startCamBtn.addEventListener("click", async () => {
    // Some browsers only label devices after permission is granted
    await startCamera();
    await listCameras().catch(() => {});
  });
  stopCamBtn.addEventListener("click", stopCamera);
  captureBtn.addEventListener("click", captureAndAnalyze);
} else {
  // Fallback: file input capture attribute helps on mobile
  document.getElementById("file")?.setAttribute("capture", "environment");
}

// ===== existing upload handler remains unchanged =====
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
    alert("Provide an image URL, choose a file, or use the camera.");
    return;
  }

  const data = await res.json();
  analysisPre.textContent = JSON.stringify(data, null, 2);

  const caption = data?.captionResult?.text || data?.caption?.text || "";
  const ocr = (data?.readResult?.content || data?.ocrResult?.text || "").trim();
  lastText = caption || ocr || `${caption} ${ocr}`.trim();
});

