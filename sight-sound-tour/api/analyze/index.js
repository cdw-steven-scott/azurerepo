async function getAuthHeaders(context, kind) {
  // kind: "vision" | "translator" | "speech"
  // 1) MSI (App Service endpoint first, IMDS fallback)
  const resource = "https://cognitiveservices.azure.com";
  try {
    const endpoint = process.env.IDENTITY_ENDPOINT;
    const secret = process.env.IDENTITY_HEADER;
    if (endpoint && secret) {
      const url = new URL(endpoint);
      url.searchParams.set("resource", resource);
      url.searchParams.set("api-version", "2019-08-01");
      const r = await fetch(url, { headers: { "X-IDENTITY-HEADER": secret } });
      if (r.ok) {
        const { access_token } = await r.json();
        return { Authorization: `Bearer ${access_token}` };
      }
    } else {
      const imds = "http://169.254.169.254/metadata/identity/oauth2/token?resource="
        + encodeURIComponent(resource) + "&api-version=2018-02-01";
      const r = await fetch(imds, { headers: { Metadata: "true" } });
      if (r.ok) {
        const { access_token } = await r.json();
        return { Authorization: `Bearer ${access_token}` };
      }
    }
  } catch (e) {
    context.log.warn("MSI token fetch failed, will try key if available:", String(e));
  }
  // 2) Key fallback
  if (kind === "vision" && process.env.VISION_KEY) return { "Ocp-Apim-Subscription-Key": process.env.VISION_KEY };
  // (translator & speech handled in their functions)
  throw new Error("No MSI token and no key available");
}

module.exports = async function (context, req) {
  try {
    const features = (req.query?.features || "caption,objects,read").trim();
    const base = (process.env.VISION_ENDPOINT || "").replace(/\/$/, "");
    if (!base) return (context.res = { status: 500, body: { error: "config", detail: "Missing VISION_ENDPOINT" } });

    const url = `${base}/computervision/imageanalysis:analyze?api-version=2024-02-01&features=${encodeURIComponent(features)}`;
    const headers = await getAuthHeaders(context, "vision"); // << use auth helper
    headers.Accept = "application/json";

    let body;
    if (req.query?.imageUrl) { headers["Content-Type"] = "application/json"; body = JSON.stringify({ url: req.query.imageUrl }); }
    else if (req.body)       { headers["Content-Type"] = "application/octet-stream"; body = req.body; }
    else return (context.res = { status: 400, body: { error: "no_image", detail: "Provide imageUrl or binary body" } });

    const resp = await fetch(url, { method: "POST", headers, body });
    const txt = await resp.text().catch(() => "");
    let data; try { data = JSON.parse(txt); } catch { data = { raw: txt } }
    context.res = { status: resp.status, body: data };
  } catch (err) {
    context.log.error("Analyze error:", err);
    context.res = { status: 500, body: { error: "analysis_failed", detail: String(err) } };
  }
};
