// Analyze via Azure Computer Vision Image Analysis API
// Accepts direct image URLs OR any page URL (e.g., Google Images results), resolves the largest image.
// Auth uses VISION_KEY (simple & reliable for demos). MSI can be added later.

const isImgExt = (u) => /\.(jpg|jpeg|png|webp|gif|bmp|tiff?)($|\?)/i.test(u);

// Simple absolute URL resolver
function absolutize(base, maybe) {
  try {
    if (!maybe) return null;
    if (maybe.startsWith("//")) return "https:" + maybe;
    if (maybe.startsWith("http://") || maybe.startsWith("https://")) return maybe;
    return new URL(maybe, base).toString();
  } catch { return null; }
}

// Extract <img src="..."> and srcset URLs
function extractImageUrls(html, baseUrl) {
  const out = new Set();

  // <img ... src="...">
  const imgRe = /<img\b[^>]*?\bsrc\s*=\s*["']([^"'>]+)["'][^>]*>/ig;
  let m;
  while ((m = imgRe.exec(html))) {
    const u = absolutize(baseUrl, m[1]);
    if (u) out.add(u);
  }

  // srcset="... 1x, ... 2x"
  const setRe = /<img\b[^>]*?\bsrcset\s*=\s*["']([^"']+)["'][^>]*>/ig;
  while ((m = setRe.exec(html))) {
    const items = m[1].split(",").map(s => s.trim().split(/\s+/)[0]).filter(Boolean);
    for (const raw of items) {
      const u = absolutize(baseUrl, raw);
      if (u) out.add(u);
    }
  }

  // OpenGraph / Twitter cards often have better images
  const metaRe = /<meta\s+property=["'](?:og:image|twitter:image)["']\s+content=["']([^"']+)["'][^>]*>/ig;
  while ((m = metaRe.exec(html))) {
    const u = absolutize(baseUrl, m[1]);
    if (u) out.add(u);
  }

  // Filter obvious junk (data URIs, tiny svgs, sprites)
  return [...out].filter(u =>
    !u.startsWith("data:") &&
    !/sprite|icon|logo|favicon|transparent|1x1|pixel/i.test(u)
  );
}

// Try HEAD to get content-length/content-type
async function headInfo(url, timeoutMs = 3000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { method: "HEAD", redirect: "follow", signal: ctl.signal });
    const len = Number(r.headers.get("content-length")) || 0;
    const type = (r.headers.get("content-type") || "").toLowerCase();
    return { ok: r.ok, len, type };
  } catch {
    return { ok: false, len: 0, type: "" };
  } finally {
    clearTimeout(t);
  }
}

// Heuristic score: prefer real image content types/extensions, larger content-length, “big-ish” hints in URL
function scoreCandidate(u, info) {
  let s = 0;

  if (isImgExt(u)) s += 500;
  if (/(\b|_)(large|xlarge|xl|1920|1080|1200|2048|hires|original)(\b|_)/i.test(u)) s += 250;
  if (/(\b|[_\-])thumb|thumbnail|small|sm(\b|[_\-])/i.test(u)) s -= 300;

  // Content-type
  if (/image\//.test(info.type)) s += 400;
  else if (info.type) s -= 100;

  // Content-length (cap logarithmically)
  if (info.len > 0) s += Math.min(600, Math.log10(info.len + 1) * 120); // ~120 pts per order of magnitude

  return s;
}

// Resolve the "best" image URL from a page
async function resolveBestImageFromPage(context, pageUrl) {
  context.log(`Resolving image from page: ${pageUrl}`);
  const html = await fetch(pageUrl, { redirect: "follow" }).then(r => r.text());
  const candidates = extractImageUrls(html, pageUrl);

  if (candidates.length === 0) {
    context.log.warn("No <img> candidates found on page.");
    return null;
  }

  // Limit HEAD probes to top N by quick guess (extension hints first)
  const hinted = candidates.sort((a, b) => Number(isImgExt(b)) - Number(isImgExt(a))).slice(0, 12);

  const infos = await Promise.all(hinted.map(async (u) => {
    const info = await headInfo(u);
    return { url: u, info, score: scoreCandidate(u, info) };
  }));

  // If all HEADs failed, fallback to first candidate with image-looking extension
  const viable = infos.filter(x => x.info.ok || isImgExt(x.url));
  if (viable.length === 0) {
    return candidates[0]; // last resort
  }

  viable.sort((a, b) => b.score - a.score);
  const winner = viable[0];
  context.log(`Resolved image: ${winner.url} (score=${winner.score}, len=${winner.info.len}, type=${winner.info.type})`);
  return winner.url;
}

module.exports = async function (context, req) {
  const start = Date.now();
  try {
    context.log("Analyze invoked");

    const endpoint = (process.env.VISION_ENDPOINT || "").replace(/\/$/, "");
    const key = process.env.VISION_KEY;
    if (!endpoint || !key) {
      context.res = { status: 500, body: { error: "config", detail: "Missing VISION_ENDPOINT or VISION_KEY" } };
      return;
    }

    // imageUrl OR raw body
    let imageUrl = req.query?.imageUrl || req.body?.imageUrl || null;

    // If we were given a page URL (non-image), try to resolve the largest image on that page
    if (imageUrl && !isImgExt(imageUrl)) {
      try {
        imageUrl = await resolveBestImageFromPage(context, imageUrl) || imageUrl;
      } catch (e) {
        context.log.warn("Page resolve failed, will try as-is:", String(e));
      }
    }

    if (!imageUrl && !req.body) {
      context.res = { status: 400, body: { error: "no_image", detail: "Provide ?imageUrl= or POST binary body" } };
      return;
    }

    const features = (req.query?.features || "caption,objects,read").trim();
    const url = `${endpoint}/computervision/imageanalysis:analyze?api-version=2024-02-01&features=${encodeURIComponent(features)}&modelVersion=latest&language=en`;

    const headers = { "Ocp-Apim-Subscription-Key": key };
    let body;
    if (imageUrl) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify({ url: imageUrl });
    } else {
      headers["Content-Type"] = "application/octet-stream";
      body = req.body; // Buffer
    }

    const resp = await fetch(url, { method: "POST", headers, body, redirect: "follow" });
    const text = await resp.text();

    // Helpful logs
    context.log(`Vision status=${resp.status} body[0..200]=${text.slice(0, 200)}`);

    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    context.res = { status: resp.status, headers: { "Content-Type": "application/json" }, body: data };
  } catch (err) {
    context.log.error("Analyze error:", err);
    context.res = { status: 500, body: { error: "analysis_failed", detail: String(err) } };
  } finally {
    context.log(`Analyze finished in ${Date.now() - start} ms`);
  }
};
