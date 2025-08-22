async function getAuthHeaders(context) {
  // MSI first
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
  // Key fallback
  if (process.env.TRANSLATOR_KEY) return { "Ocp-Apim-Subscription-Key": process.env.TRANSLATOR_KEY };
  throw new Error("No MSI token and no TRANSLATOR_KEY available");
}

module.exports = async function (context, req) {
  try {
    const endpoint = (process.env.TRANSLATOR_ENDPOINT || "").replace(/\/$/, "");
    const region = (process.env.TRANSLATOR_REGION || process.env.SPEECH_REGION || "eastus").trim();
    const to = (req.body?.to || req.query?.to || "en").trim();
    const text = (req.body?.text || req.query?.text || "").toString();
    if (!endpoint) return (context.res = { status: 500, body: { error: "config", detail: "Missing TRANSLATOR_ENDPOINT" } });
    if (!text)     return (context.res = { status: 400, body: { error: "no_text", detail: "Provide { text, to }" } });

    const auth = await getAuthHeaders(context);
    const headers = { ...auth, "Ocp-Apim-Subscription-Region": region, "Content-Type": "application/json", "Accept": "application/json" };
    const url = `${endpoint}/translate?api-version=3.0&to=${encodeURIComponent(to)}`;
    const resp = await fetch(url, { method: "POST", headers, body: JSON.stringify([{ text }]) });

    const txt = await resp.text().catch(() => ""); let data; try { data = JSON.parse(txt); } catch { data = { raw: txt } }
    const translatedText = Array.isArray(data) && data[0]?.translations?.[0]?.text ? data[0].translations[0].text : null;
    context.res = translatedText != null ? { status: resp.status, body: { translatedText, raw: data } } : { status: resp.status, body: data };
  } catch (err) {
    context.log.error("Translate error:", err);
    context.res = { status: 500, body: { error: "translate_failed", detail: String(err) } };
  }
};
