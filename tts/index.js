// Text-to-Speech via Azure Speech (REST)
// Auth: API key (SPEECH_KEY) + region (SPEECH_REGION)
// Node 18+ has global fetch, no extra deps needed.

module.exports = async function (context, req) {
  const started = Date.now();
  try {
    const region = (process.env.SPEECH_REGION || "").trim();
    const key = (process.env.SPEECH_KEY || "").trim();
    if (!region || !key) {
      context.res = {
        status: 500,
        headers: { "Content-Type": "application/json" },
        body: { error: "config", detail: "Missing SPEECH_REGION or SPEECH_KEY" }
      };
      return;
    }

    // Inputs: text, voice, format
    const text =
      (req.body && (req.body.text || req.body.ssmlText)) ||
      req.query?.text ||
      "";
    if (!text) {
      context.res = {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: { error: "no_text", detail: "Provide text in body { text } or ?text=" }
      };
      return;
    }

    const voice =
      (req.body && req.body.voice) ||
      req.query?.voice ||
      "en-US-JennyNeural";

    // Common formats:
    //   "audio-24khz-160kbitrate-mono-mp3"
    //   "audio-16khz-128kbitrate-mono-mp3"
    //   "riff-24khz-16bit-mono-pcm" (WAV)
    const outputFormat =
      (req.body && req.body.format) ||
      req.query?.format ||
      "audio-24khz-160kbitrate-mono-mp3";

    // Build SSML
    const ssml = `<?xml version="1.0" encoding="utf-8"?>
<speak version="1.0" xml:lang="en-US">
  <voice name="${voice}">${escapeXml(text)}</voice>
</speak>`;

    const ttsUrl = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;

    const resp = await fetch(ttsUrl, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": outputFormat,
        "User-Agent": "sight-sound-tour"
      },
      body: ssml
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      context.log.error(`TTS failed ${resp.status}: ${errText}`);
      context.res = {
        status: resp.status,
        headers: { "Content-Type": "application/json" },
        body: { error: "tts_failed", status: resp.status, detail: errText }
      };
      return;
    }

    const ab = await resp.arrayBuffer();
    const audio = Buffer.from(ab);

    // Guess content-type from format (defaults to mp3)
    const contentType =
      /pcm|riff/i.test(outputFormat) ? "audio/wav" :
      /ogg/i.test(outputFormat) ? "audio/ogg" :
      "audio/mpeg";

    context.res = {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": 'inline; filename="speech.mp3"',
        // Important for binary in Node Functions
        "Cache-Control": "no-store"
      },
      body: audio,
      isRaw: true
    };
  } catch (err) {
    context.log.error("TTS error:", err);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: { error: "tts_exception", detail: String(err) }
    };
  } finally {
    context.log(`TTS finished in ${Date.now() - started} ms`);
  }
};

// Minimal XML escape
function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
