// Speech-to-Text (Azure Speech Services) for Azure Functions (Node 22, CommonJS)
// Accepts ?audioUrl=... or binary body (audio/*). Uses Speech key -> Bearer token -> STT REST API.
// App settings required: SPEECH_REGION, SPEECH_KEY

async function fetchText(url, opts) {
  const r = await fetch(url, opts);
  const t = await r.text();
  return { r, t };
}

function pickAudioContentType(url, fallback = "audio/wav") {
  if (!url) return fallback;
  const u = url.toLowerCase();
  if (u.endsWith(".wav")) return "audio/wav";
  if (u.endsWith(".mp3")) return "audio/mpeg";
  if (u.endsWith(".ogg") || u.endsWith(".oga")) return "audio/ogg";
  if (u.endsWith(".m4a")) return "audio/mp4"; // good enough for AAC in MP4 container
  if (u.endsWith(".flac")) return "audio/flac";
  return fallback;
}

module.exports = async function (context, req) {
  const started = Date.now();
  try {
    context.log("Transcribe invoked");

    const region = (process.env.SPEECH_REGION || "").trim();
    const key = (process.env.SPEECH_KEY || "").trim();
    if (!region || !key) {
      context.res = { status: 500, body: { error: "config", detail: "Missing SPEECH_REGION or SPEECH_KEY" } };
      return;
    }

    const language = (req.query?.language || "en-US").trim();
    const profanity = (req.query?.profanity || "masked").trim(); // masked | removed | raw

    // 1) Get a short-lived Bearer token using the Speech key
    const tokenUrl = `https://${region}.api.cognitive.microsoft.com/sts/v1.0/issuetoken`;
    const { r: tokResp, t: tokText } = await fetchText(tokenUrl, {
      method: "POST",
      headers: { "Ocp-Apim-Subscription-Key": key }
    });
    if (!tokResp.ok) {
      context.log.error("Token error:", tokResp.status, tokText);
      context.res = { status: 502, body: { error: "token_failed", detail: tokText } };
      return;
    }
    const token = tokText; // token body is plain text

    // 2) Build the STT endpoint (conversation mode works well for general audio)
    const sttUrl =
      `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1` +
      `?language=${encodeURIComponent(language)}&profanity=${encodeURIComponent(profanity)}`;

    let audioBytes = null;
    let contentType = null;

    // Accept either binary body (audio/*) or ?audioUrl=...
    if (req.body && Buffer.isBuffer(req.body) && req.headers["content-type"]?.startsWith("audio/")) {
      audioBytes = req.body;
      contentType = req.headers["content-type"];
    } else if (req.query?.audioUrl) {
      const audioUrl = req.query.audioUrl;
      contentType = pickAudioContentType(audioUrl);
      const audioResp = await fetch(audioUrl, { redirect: "follow" });
      if (!audioResp.ok) {
        const errTxt = await audioResp.text().catch(() => "");
        context.res = { status: 400, body: { error: "fetch_audio_failed", detail: `GET ${audioUrl} -> ${audioResp.status} ${errTxt}` } };
        return;
      }
      const arrBuf = await audioResp.arrayBuffer();
      audioBytes = Buffer.from(arrBuf);
    } else {
      context.res = { status: 400, body: { error: "no_audio", detail: "Provide ?audioUrl= or POST audio/* bytes" } };
      return;
    }

    // 3) Call STT
    const sttResp = await fetch(sttUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": contentType,
        "Accept": "application/json;text/xml"
      },
      body: audioBytes
    });

    const sttText = await sttResp.text();
    context.log(`STT status=${sttResp.status} body[0..200]=${sttText.slice(0,200)}`);

    // STT returns JSON with "RecognitionStatus"/"DisplayText" (older) or NBest list (newer)
    let data;
    try { data = JSON.parse(sttText); } catch { data = { raw: sttText }; }

    // Normalize a simple result field where possible
    let transcript = null;
    if (data.DisplayText) {
      transcript = data.DisplayText;
    } else if (Array.isArray(data.NBest) && data.NBest[0]?.Display) {
      transcript = data.NBest[0].Display;
    } else if (data.text) {
      transcript = data.text;
    }

    context.res = {
      status: sttResp.status,
      headers: { "Content-Type": "application/json" },
      body: transcript ? { transcript, raw: data } : data
    };
  } catch (err) {
    context.log.error("Transcribe error:", err);
    context.res = { status: 500, body: { error: "transcribe_failed", detail: String(err) } };
  } finally {
    context.log(`Transcribe finished in ${Date.now() - started} ms`);
  }
};
