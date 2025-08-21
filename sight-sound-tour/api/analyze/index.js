import fetch from "node-fetch";
import Busboy from "busboy";
import { cfg, getCogsToken } from "../shared/clients.js";

export default async function (context, req) {
  try {
    const { imageUrl, features } = req.query || {};
    const feats = features || "caption,objects,ocr"; // tweak as desired

    const url = `${cfg.visionEndpoint}/computervision/imageanalysis:analyze?features=${encodeURIComponent(feats)}`;

    let body;
    let headers = { "Authorization": `Bearer ${await getCogsToken()}` };

    if (imageUrl) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify({ url: imageUrl });
    } else {
      // Parse multipart form-data and read file buffer
      const buf = await readMultipartToBuffer(req, context);
      headers["Content-Type"] = "application/octet-stream";
      body = buf;
    }

    const resp = await fetch(url, { method: "POST", headers, body });
    const data = await resp.json().catch(() => ({}));

    context.res = { status: resp.status, body: data };
  } catch (err) {
    context.log.error(err);
    context.res = { status: 500, body: { error: "analysis_failed", detail: `${err}` } };
  }
}

function readMultipartToBuffer(req, context) {
  return new Promise((resolve, reject) => {
    try {
      const busboy = Busboy({ headers: req.headers });
      let chunks = [];
      busboy.on("file", (_name, file) => {
        file.on("data", (d) => chunks.push(d));
      });
      busboy.on("finish", () => resolve(Buffer.concat(chunks)));
      busboy.on("error", reject);
      busboy.end(req.body);
    } catch (e) {
      context.log.warn("No multipart body; falling back to raw bytes");
      resolve(Buffer.from(req.body || []));
    }
  });
}
