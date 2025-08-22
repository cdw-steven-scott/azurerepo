// Azure Functions (Node 22, CommonJS) - robust MSI token + Image Analysis 4.0
// Uses App Service MSI endpoint if available, otherwise IMDS fallback

async function getBearerToken(context) {
  const endpoint = process.env.IDENTITY_ENDPOINT; // App Service MSI endpoint
  const secret = process.env.IDENTITY_HEADER;     // App Service MSI secret
  const resource = "https://cognitiveservices.azure.com";

  if (endpoint && secret) {
    // App Service / Functions-in-AppService style
    const url = new URL(endpoint);
    url.searchParams.set("resource", resource);
    url.searchParams.set("api-version", "2019-08-01"); // required for App Service MSI endpoint
    const resp = await fetch(url, {
      headers: { "X-IDENTITY-HEADER": secret }
    });
    if (!resp.ok) {
      const t = await resp.text();
      throw new Error(`MSI(AppService) failed: ${resp.status} ${t}`);
    }
    const json = await resp.json();
    return json.access_token;
  } else {
    // IMDS fallback
    const imds = "http://169.254.169.254/metadata/identity/oauth2/token"
      + "?resource=https%3A%2F%2Fcognitiveservices.azure.com&api-version=2018-02-01";
    const resp = await fetch(imds, { headers: { Metadata: "true" } });
    if (!resp.ok) {
      const t = await resp.text();
      throw new Error(`MSI(IMDS) failed: ${resp.status} ${t}`);
    }
    const json = await resp.json();
    return json.access_token;
  }
}

module.exports = async function (context, req) {
  try {
    context.log("Analyze invoked");

    const features = (req.query?.features || "caption,objects,read").trim();

    const visionEndpoint = process.env.VISION_ENDPOINT;
    if (!visionEndpoint) {
      context.res = { status: 500, body: { error: "config", detail: "Missing VISION_ENDPOINT" } };
      return;
    }

    // Image Analysis 4.0 endpoint + API version
    const base = visionEndpoint.replace(/\/$/, "");
    const url = `${base}/computervision/imageanalysis:analyze?api-version=2024-02-01&features=${encodeURIComponent(features)}`;

    // Acquire token (handles both App Service MSI and IMDS)
    const access_token = await getBearerToken(context);

    // Build request to IA 4.0 (support imageUrl or raw bytes)
    const headers = {
      Authorization: `Bearer ${access_token}`,
      Accept: "application/json"
    };
    let body;

    if (req.query?.imageUrl) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify({ url: req.query.imageUrl });
      context.log("Using imageUrl flow");
    } else if (req.body) {
      headers["Content-Type"] = "application/octet-stream";
      body = req.body; // Buffer for octet-stream
      context.log("Using octet-stream flow; bytes:", req.body.length || "unknown");
    } else {
      context.res = { status: 400, body: { error: "no_image", detail: "Provide imageUrl or binary body" } };
      return;
    }

    const resp = await fetch(url, { method: "POST", headers, body });
    const text = await resp.text();
    let data; try { data = JSON.parse(text); } catch { data = { raw: text } }

    // Return the service status/body directly (so you see any errors)
    context.res = { status: resp.status, body: data };
  } catch (err) {
    context.log.error("Analyze error:", err);
    context.res = { status: 500, body: { error: "analysis_failed", detail: String(err) } };
  }
};
