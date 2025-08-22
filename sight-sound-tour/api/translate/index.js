// Azure Functions (Node 22, CommonJS) — Translator Text via Managed Identity

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

module.exports = async function (context, req) {
  try {
    context.log("Translate invoked");

    const endpoint = (process.env.TRANSLATOR_ENDPOINT || "").replace(/\/$/, "");
    const region = (process.env.TRANSLATOR_REGION || process.env.SPEECH_REGION || "eastus").trim();
    if (!endpoint) {
      context.res = { status: 500, body: { error: "config", detail: "Missing TRANSLATOR_ENDPOINT" } };
      return;
    }

    const to = (req.body?.to || req.query?.to || "en").trim();
    const text = (req.body?.text || req.query?.text || "").toString();
    if (!text) {
      context.res = { status: 400, body: { error: "no_text", detail: "Provide { text, to }" } };
      return;
    }

    const token = await getBearerToken(context);
    const url = `${endpoint}/translate?api-version=3.0&to=${encodeURIComponent(to)}`;
    const payload = [{ text }];

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Ocp-Apim-Subscription-Region": region, // harmless with AAD; needed in some configs
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const txt = await resp.text().catch(() => "");
    let data; try { data = JSON.parse(txt); } catch { data = { raw: txt } }

    const translatedText =
      Array.isArray(data) && data[0]?.translations?.[0]?.text ? data[0].translations[0].text : null;

    context.res = translatedText != null
      ? { status: resp.status, body: { translatedText, raw: data } }
      : { status: resp.status, body: data };
  } catch (err) {
    context.log.error("Translate error:", err);
    context.res = { status: 500, body: { error: "translate_failed", detail: String(err) } };
  }
};
