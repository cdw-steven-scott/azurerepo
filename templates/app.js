// Simple helper
const $ = (q) => document.querySelector(q);
const byId = (id) => document.getElementById(id);

let API_BASE = window.API_BASE || "";
const apiBaseInput = byId("apiBase");
apiBaseInput.value = API_BASE;
byId("applyApi").onclick = () => {
  API_BASE = apiBaseInput.value.trim().replace(/\/$/, "");
  window.localStorage.setItem("apiBase", API_BASE);
  toast(`API base set to: ${API_BASE}`);
};

// load persisted API base
const saved = localStorage.getItem("apiBase");
if (saved) {
  API_BASE = saved;
  apiBaseInput.value = saved;
}

// Tabs
const tabs = document.querySelectorAll(".tab");
const panes = document.querySelectorAll(".pane");
tabs.forEach(btn => {
  btn.addEventListener("click", () => {
    tabs.forEach(b => b.classList.remove("active"));
    panes.forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    const t = btn.getAttribute("data-target");
    document.querySelector(t).classList.add("active");
  });
});

// UI element variables
const preview = byId("preview");
const fileInput = byId("fileInput");
const imageUrl = byId("imageUrl");
const analyzeBtn = byId("analyzeBtn");
const statusBox = byId("status");

const captionEl = byId("caption");
const denseCaptionsEl = byId("denseCaptions");
const tagsEl = byId("tags");
const objectsEl = byId("objects");
const ocrEl = byId("ocr");

const captionEl = byId("caption");
const denseCaptionsEl = byId("denseCaptions");
const tagsEl = byId("tags");
const objectsEl = byId("objects");
const ocrEl = byId("ocr");

const speakBtn = byId("speakBtn");
const voiceSel = byId("voice");
const formatSel = byId("format");
const player = byId("player");
const autoSpeakCheckbox = byId("autoSpeak"); 

let lastCaption = "";

// Camera bits
const video = byId("video");
const canvas = byId("canvas");
const cameraSelect = byId("cameraSelect");
const startCamBtn = byId("startCam");
const stopCamBtn = byId("stopCam");
const snapBtn = byId("snap");

let stream = null;

async function listCameras() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter(d => d.kind === "videoinput");
    cameraSelect.innerHTML = "";
    cams.forEach((c, i) => {
      const opt = document.createElement("option");
      opt.value = c.deviceId;
      opt.textContent = c.label || `Camera ${i+1}`;
      cameraSelect.appendChild(opt);
    });
  } catch (e) {
    toast("Cannot list cameras. Grant permission first.");
  }
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    toast("getUserMedia not supported in this browser.");
    return;
  }
  const deviceId = cameraSelect.value || undefined;
  stream = await navigator.mediaDevices.getUserMedia({
    video: deviceId ? { deviceId: { exact: deviceId } } : true,
    audio: false
  });
  video.srcObject = stream;
  await video.play();
  startCamBtn.disabled = true;
  stopCamBtn.disabled = false;
  snapBtn.disabled = false;
}

function stopCamera() {
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
  video.pause();
  video.srcObject = null;
  startCamBtn.disabled = false;
  stopCamBtn.disabled = true;
  snapBtn.disabled = true;
}

function snapPhotoToPreview() {
  const w = video.videoWidth || 640;
  const h = video.videoHeight || 480;
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, w, h);
  canvas.toBlob(blob => {
    if (!blob) return;
    // Build an object URL for preview
    const url = URL.createObjectURL(blob);
    preview.src = url;
    // Also stash the blob on the input so analyze can pick it up
    preview._blob = blob;
  }, "image/jpeg", 0.92);
}

startCamBtn.addEventListener("click", async () => {
  await listCameras(); // ensure list
  await startCamera();
});
stopCamBtn.addEventListener("click", stopCamera);
snapBtn.addEventListener("click", snapPhotoToPreview);

// Update preview when uploading a file
fileInput.addEventListener("change", () => {
  const f = fileInput.files?.[0];
  if (!f) return;
  const url = URL.createObjectURL(f);
  preview.src = url;
  preview._blob = null; // use fileInput for sending
});

// Update preview from URL
imageUrl.addEventListener("input", () => {
  const v = imageUrl.value.trim();
  preview.src = v || "";
  preview._blob = null;
});

function toast(msg) {
  statusBox.textContent = msg;
  statusBox.classList.add("show");
  clearTimeout(statusBox._t);
  statusBox._t = setTimeout(() => statusBox.classList.remove("show"), 3500);
}

async function analyze() {
  if (!API_BASE) return toast("Set API base first.");
  analyzeBtn.disabled = true;
  speakBtn.disabled = true;
  captionEl.textContent = "—";
  objectsEl.textContent = "(none)";
  ocrEl.textContent = "(none)";
  player.classList.add("hide");
  player.src = "";

  try {
    const params = new URLSearchParams({
      // REQUESTING MORE FEATURES: DenseCaptions and Tags
      features: "caption,objects,read,DenseCaptions,Tags"
    });

    let resp;
    // Priorities: camera snap blob → file upload → URL param
    if (preview._blob instanceof Blob) {
      // From camera snapshot
      resp = await fetch(`${API_BASE}/api/analyze?${params}`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: preview._blob
      });
    } else if (fileInput.files?.[0]) {
      const file = fileInput.files[0];
      resp = await fetch(`${API_BASE}/api/analyze?${params}`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: file
      });
    } else if (imageUrl.value.trim()) {
      params.set("imageUrl", imageUrl.value.trim());
      resp = await fetch(`${API_BASE}/api/analyze?${params}`, { method: "POST" });
    } else {
      toast("Provide an image (upload, camera, or URL).");
      return;
    }

    if (!resp.ok) {
      const errorText = await resp.text();
      console.error("Analyze API failed:", errorText);
      throw new Error(`Analyze API failed with status ${resp.status}: ${errorText.slice(0, 100)}...`);
    }

    const txt = await resp.text();
    let data;
    try {
      data = JSON.parse(txt);
    } catch {
      data = { raw: txt };
    }

    const cap = data?.captionResult?.text || data?.caption?.text || data?.description?.captions?.[0]?.text || "";
    lastCaption = cap || "";
    captionEl.textContent = lastCaption || "(no caption)";

    // UPDATED LOGIC TO DISPLAY DENSE CAPTIONS AND TAGS
    const denseCaptions = data?.denseCaptionsResult?.values || data?.denseCaptions || [];
    denseCaptionsEl.textContent = JSON.stringify(denseCaptions, null, 2);

    const tags = data?.tagsResult?.values || data?.tags || [];
    tagsEl.textContent = JSON.stringify(tags, null, 2);
        
      // New code to extract and display Dense Captions
      const denseCaptions = data?.denseCaptionsResult?.values || data?.denseCaptions || [];
      if (denseCaptions.length > 0) {
    // Format the dense captions into a readable string
    const formattedCaptions = denseCaptions.map(c => `[${(c.confidence * 100).toFixed(0)}% confidence] ${c.text}`).join('\n');
    denseCaptionsEl.textContent = formattedCaptions;
      } else {
    denseCaptionsEl.textContent = "(none)";
      }

      // New code to extract and display Tags
      const tags = data?.tagsResult?.values || data?.tags || [];
      if (tags.length > 0) {
          // Format the tags into a comma-separated list
          const formattedTags = tags.map(t => `${t.name} (${(t.confidence * 100).toFixed(0)}%)`).join(', ');
          tagsEl.textContent = formattedTags;
      } else {
          tagsEl.textContent = "(none)";
      }
    const objects = data?.objectsResult?.values || data?.objects || [];
    objectsEl.textContent = JSON.stringify(objects, null, 2);

    const ocr = data?.readResult?.content || data?.readResult || data?.ocr;
    if (typeof ocr === "string") {
      ocrEl.textContent = ocr;
    } else {
      ocrEl.textContent = JSON.stringify(ocr, null, 2);
    }

    toast("Analyze complete");

    if (lastCaption) {
        if (autoSpeakCheckbox.checked) {
            await speak();
        } else {
            speakBtn.disabled = false;
        }
    }

  } catch (e) {
    console.error("Analyze exception:", e);
    toast(`Analyze exception: ${e.message}`);
  } finally {
    analyzeBtn.disabled = false;
  }
}

async function speak() {
  if (!API_BASE) return toast("Set API base first.");
  if (!lastCaption) return toast("No caption to speak.");
  speakBtn.disabled = true;
  player.classList.add("hide");
  player.src = "";

  try {
    const body = {
      text: lastCaption,
      voice: voiceSel.value,
      format: formatSel.value
    };
    const resp = await fetch(`${API_BASE}/api/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!resp.ok) {
      const err = await resp.text();
      console.error("TTS failed:", err);
      toast(`TTS failed (${resp.status})`);
      return;
    }
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    player.src = url;
    player.classList.remove("hide");
    player.play().catch(() => {/* user gesture may be required */});
    toast("Speaking…");
  } catch (e) {
    console.error(e);
    toast("TTS exception");
  } finally {
    speakBtn.disabled = false;
  }
}

// Wire buttons
analyzeBtn.addEventListener("click", analyze);
speakBtn.addEventListener("click", speak);

// Init camera list early (will show blank labels until permission granted)
if (navigator.mediaDevices?.enumerateDevices) {
  listCameras().catch(() => {});
}
