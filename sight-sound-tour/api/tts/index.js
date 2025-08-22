async function getAuthHeaders(context) {
  const resource = "https://cognitiveservices.azure.com";
  try {
    const endpoint = process.env.IDENTITY_ENDPOINT, secret = process.env.IDENTITY_HEADER;
    if (endpoint && secret) {
      const u = new URL(endpoint); u.searchParams.set("resource", resource); u.searchParams.set("api-version", "2019-08-01");
      const r = await fetch(u, { headers: { "X-IDENTITY-HEADER": secret } });
      if (r.ok) return { Authorization: `Bearer ${(await r.json()).access_token}` };
    } else {
      const imds = "http://169.254.169.254/metadata/identity/oauth2/token?resource="+encodeURIComponent(resource)+"&api-version=2018-02-01";
      const r = await fetch(imds, { headers: { Metadata: "true" } });
      if (r.ok) return { Authorization: `Bearer ${(await r.json()).access_token}` };
    }
  } catch (e) { context.log.warn("MSI token fetch failed, will try key:", String(e)); }
  if (process.env.SPEECH_KEY) return { "Ocp-Apim-Subscription-Key": process.env.SPEECH_KEY };
  throw new Error("No MSI token and no SPEECH_KEY available");
}

module.exports = async function (context, req) {
  try {
    const region = (process.env.SPEECH_REGION || "eastus").trim();
    const text = (req.body?.text || req.query?.text || "").toString();
    const voice = (req.body?.voice || req.query?.voice || "en-US-JennyNeural").toString();
    if (!text) return (context.res = { status: 400, body: { error: "no_text", detail: "Provide { text, voice? }" } });

    const auth = await getAuthHeaders(context);
    const url = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
    const safe = text.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    const ssml = `<?xml version="1.0" encoding="UTF-8"?><speak version="1.0" xml:lang="en-US"><voice name="${voice}">${safe}</voice></speak>`;

    const headers = {
      ...auth,
      "Ocp-Apim-Subscription-Region": region,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
      "User-Agent": "sight-sound-tour-func"
    };

    const resp = await fetch(url, { method: "POST", headers, body: ssml });
    const ok = resp.ok;
    const buf = Buffer.from(await resp.arrayBuffer().catch(async () => Buffer.from(await resp.text())));

    context.res = ok
      ? { status: 200, headers: { "Content-Type": "audio/mpeg", "Content-Length": buf.length }, body: buf }
      : { status: resp.status, headers: { "Content-Type": "application/json" }, body: buf };
  } catch (err) {
    context.log.error("TTS error:", err);
    context.res = { status: 500, body: { error: "tts_failed", detail: String(err) } };
  }
};
