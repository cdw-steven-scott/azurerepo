// analyze/index.js — uses built-in fetch (Node 18/20/22). No node-fetch needed.
module.exports = async function (context, req) {
  const start = Date.now();
  try {
    context.log("Analyze invoked");

    const endpoint = (process.env.VISION_ENDPOINT || "").replace(/\/$/, "");
    const key = process.env.VISION_KEY; // you already set this
    if (!endpoint || !key) {
      context.res = { status: 500, body: { error: "config", detail: "Missing VISION_ENDPOINT or VISION_KEY" } };
      return;
    }

    const features = (req.query?.features || "caption,objects,read").trim();
    const url = `${endpoint}/computervision/imageanalysis:analyze?api-version=2024-02-01&features=${encodeURIComponent(features)}&modelVersion=latest&language=en`;

    const headers = { "Ocp-Apim-Subscription-Key": key };
    let body;

    if (req.query?.imageUrl) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify({ url: req.query.imageUrl });
    } else if (req.body) {
      headers["Content-Type"] = "application/octet-stream";
      body = req.body;
    } else {
      context.res = { status: 400, body: { error: "no_image", detail: "Use ?imageUrl= or POST binary body" } };
      return;
    }

    const resp = await fetch(url, { method: "POST", headers, body });
    const text = await resp.text();
    let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }

    context.log(`Vision status=${resp.status} body[0..160]=${text.slice(0,160)}`);
    context.res = { status: resp.status, headers: { "Content-Type": "application/json" }, body: data };
  } catch (err) {
    context.log.error("Analyze error:", err);
    context.res = { status: 500, body: { error: "analysis_failed", detail: String(err) } };
  } finally {
    context.log(`Analyze finished in ${Date.now() - start} ms`);
  }
};


