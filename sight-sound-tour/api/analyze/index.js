// Azure Functions (Node 22, CommonJS) — Image Analysis 4.0 via Managed Identity

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
    context.log("Analyze invoked");

    const features = (req.query?.features || "caption,objects,read").trim();
    const visionEndpoint = (process.env.VISION_ENDPOINT || "").replace(/\/$/, "");
    if (!visionEndpoint) {
      context.res = { status: 500, body: { error: "config", detail: "Missing VISION_ENDPOINT" } };
      return;
    }

    // IA 4.0 endpoint requires api-version
    const url = `${visionEndpoint}/computervision/imageanalysis:analyze` +
                `?api-version=2024-02-01&features=${encodeURIComponent(features)}`;

    const token = await getBearerToken(context);

    const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };
    let body;

    if (req.query?.imageUrl) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify({ url: req.query.imageUrl });
      context.log("Analyze: imageUrl flow");
    } else if (req.body) {
      headers["Content-Type"] = "application/octet-stream";
      body = req.body; // Buffer
      context.log("Analyze: octet-stream flow; bytes:", req.body.length ?? "unknown");
    } else {
      context.res = { status: 400, body: { error: "no_image", detail: "Provide imageUrl or binary body" } };
      return;
    }

    const resp = await fetch(url, { method: "POST", headers, body });
    const txt = await resp.text().catch(() => "");
    let data; try { data = JSON.parse(txt); } catch { data = { raw: txt } }

    context.res = { status: resp.status, body: data };
  } catch (err) {
    context.log.error("Analyze error:", err);
    context.res = { status: 500, body: { error: "analysis_failed", detail: String(err) } };
  }
};
