import fetch from "node-fetch";
import { cfg, getCogsToken } from "../shared/clients.js";

export default async function (context, req) {
  try {
    const { text, voice = "en-US-JennyNeural" } = req.body || {};
    const ssml = `<speak version='1.0' xml:lang='en-US'><voice name='${voice}'>${escapeXml(
      text || ""
    )}</voice></speak>`;

    const token = await getCogsToken();
    const ttsUrl = `https://${cfg.speechRegion}.tts.speech.microsoft.com/cognitiveservices/v1`;

    const resp = await fetch(ttsUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3"
      },
      body: ssml
    });

    const arr = await resp.arrayBuffer();
    context.res = {
      status: resp.status,
      headers: { "Content-Type": "audio/mpeg" },
      body: Buffer.from(arr)
    };
  } catch (err) {
    context.log.error(err);
    context.res = { status: 500, body: { error: "tts_failed", detail: `${err}` } };
  }
}

function escapeXml(s) {
  return s.replace(/[<>&'"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c])
  );
}
