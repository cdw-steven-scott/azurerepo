import { DefaultAzureCredential } from "@azure/identity";

export const credential = new DefaultAzureCredential();

export async function getCogsToken() {
  // Scope for Cognitive Services unified AAD
  const scope = "https://cognitiveservices.azure.com/.default";
  const tok = await credential.getToken(scope);
  return tok.token;
}

export const cfg = {
  visionEndpoint: process.env.VISION_ENDPOINT,                // e.g., https://cv-xyz.cognitiveservices.azure.com
  translatorEndpoint: process.env.TRANSLATOR_ENDPOINT || "https://api.cognitive.microsofttranslator.com",
  speechRegion: process.env.SPEECH_REGION || "eastus"
};
