// CommonJS handler for Azure Functions (function.json). Node 22 has global fetch.
module.exports = async function (context, req) {
  try {
    context.log("Analyze invoked");

    const features = (req.query?.features || "caption,objects,read").trim();

    const visionEndpoint = process.env.VISION_ENDPOINT;
    if (!visionEndpoint) {
      context.res = { status: 500, body: { error: "config", detail: "Missing VISION_ENDPOINT" } };
      return;
    }
    const base = visionEndpoint.replace(/\/$/, "");
    const url = `${base}/computervision/imageanalysis:analyze?api-version=2024-02-01&features=${encodeURIComponent(features)}`;

    // Managed Identity (MSI) token for Cognitive Services
    const tokenResp = await fetch(
      "http://169.254.169.254/metadata/identity/oauth2/token?resource=https%3A%2F%2Fcognitiveservices.azure.com&api-version=2018-02-01",
      { headers: { Metadata: "true" } }
    );
    if (!tokenResp.ok) {
      const t = await tokenResp.text();
      throw new Error(`MSI token failed: ${tokenResp.status} ${t}`);
    }
    const { access_token } = await tokenResp.json();

    const headers = { Authorization: `Bearer ${access_token}` };
    let body;

    if (req.query?.imageUrl) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify({ url: req.query.imageUrl });
    } else if (req.body) {
      headers["Content-Type"] = "application/octet-stream";
      body = req.body; // Buffer for octet-stream
    } else {
      context.res = { status: 400, body: { error: "no_image", detail: "Provide imageUrl or binary body" } };
      return;
    }

    const resp = await fetch(url, { method: "POST", headers, body });
    const text = await resp.text();

    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    context.res = { status: resp.status, body: data };
  } catch (err) {
    context.log.error("Analyze error:", err);
    context.res = { status: 500, body: { error: "analysis_failed", detail: String(err) } };
  }
};
