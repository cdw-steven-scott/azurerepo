// Azure Functions (Node 22, CommonJS) — Speech TTS via Managed Identity

async function getBearerToken(context) {
  const resource = "https://cognitiveservices.azure.com";
  const endpoint = process.env.IDENTITY_ENDPOINT;
  const secret = process.env.IDENTITY_HEADER;

  if (endpoint && secret) {
    const url = new URL(endpoint);
    url.searchParams.set("resource", resource);
    url.searchParams.set("api-version", "2019-08-01");
    const resp = await fetch(url, { headers: { "X-IDENTITY-HEADER": secret } });
    if (!resp.ok) throw new Error(`MSI(AppService) failed: ${resp.status} ${await resp.text()}`);
    return (await resp.json()).access_token;
  }

  const imds = "http://169.254.169.254/metadata/identity/oauth2/token?resource="
    + encodeURIComponent(resource) + "&api-version=2018-02-01";
  const resp = await fetch(imds, { headers: { Metadata: "true" } });
  if (!resp.ok) throw new Error(`MSI(IMDS) failed: ${resp.status} ${await resp.text()}`);
  return (await resp.json()).access_token;
}

function buildSsml(text, voice) {
  const safe = (text || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const v = voice || "en-US-JennyNeural";
  return `<?xml version="1.0" encoding="UTF-8"?>
<speak version="1.0" xml:lang="en-US"><voice name="${v}">${safe}</voice></speak>`;
}

module.exports = async function (context, req) {
  try {
    context.log("TTS invoked");

    const region = (process.env.SPEECH_REGION || "eastus").trim();
    const text = (req.body?.text || req.query?.text || "").toString();
    const voice = (req.body?.voice || req.query?.voice || "en-US-JennyNeural").toString();

    if (!text) {
      context.res = { status: 400, body: { error: "no_text", detail: "Provide { text, voice? }" } };
      return;
    }

    const token = await getBearerToken(context);
    const url = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
    const ssml = buildSsml(text, voice);

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Ocp-Apim-Subscription-Region": region, // harmless with AAD; needed in some key-auth paths
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
        "User-Agent": "sight-sound-tour-func"
      },
      body: ssml
    });

    const buf = Buffer.from(await resp.arrayBuffer().catch(async () => {
      // In error cases, service returns JSON; propagate that body
      const t = await resp.text();
      context.res = {
        status: resp.status,
        headers: { "Content-Type": "application/json" },
        body: t
      };
      return new ArrayBuffer(); // dummy
    }));

    if (resp.ok) {
      context.res = {
        status: 200,
        headers: {
          "Content-Type": "audio/mpeg",
          "Content-Length": buf.length
        },
        body: buf
      };
    }
    // If not ok, we already set JSON body above.
  } catch (err) {
    context.log.error("TTS error:", err);
    context.res = { status: 500, body: { error: "tts_failed", detail: String(err) } };
  }
};
