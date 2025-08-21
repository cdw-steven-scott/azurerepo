import fetch from "node-fetch";
import { cfg, getCogsToken } from "../shared/clients.js";

export default async function (context, req) {
  try {
    const body = req.body || {};
    const text = body.text || "";
    const to = body.to || "en";

    const token = await getCogsToken();
    const url = `${cfg.translatorEndpoint}/translate?api-version=3.0&to=${encodeURIComponent(to)}`;

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify([{ Text: text }])
    });

    const data = await resp.json();
    // Flatten a bit
    const translatedText = data?.[0]?.translations?.[0]?.text ?? "";
    const detectedLanguage = data?.[0]?.detectedLanguage?.language ?? null;

    context.res = {
      status: resp.status,
      body: { translatedText, detectedLanguage, raw: data }
    };
  } catch (err) {
    context.log.error(err);
    context.res = { status: 500, body: { error: "translation_failed", detail: `${err}` } };
  }
}
