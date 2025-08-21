# Sight & Sound Tour (Vision + Translator + Speech)

A tiny demo that turns a photo into: **caption / OCR → translation → spoken audio**.  
Services: Azure AI **Vision**, **Translator**, **Speech**. Backend: **Azure Functions** with **Managed Identity**.

## Deploy (GitHub Actions)
1. Add repo/organization secrets:
   - `AZURE_CLIENT_ID` (Federated Credentials App Registration)
   - `AZURE_TENANT_ID`
   - `AZURE_SUBSCRIPTION_ID`
2. Optional: adjust `RG_NAME`, `LOCATION` in `.github/workflows/tour-guide.yml`.
3. Commit & push to your branch. The workflow will:
   - Create/Update infra with Bicep
   - Grant **Cognitive Services User** RBAC to the Function’s MI
   - Deploy the Functions package

## Configure your Web App
- Serve `sight-sound-tour/web/` (or copy into your existing site).
- If your Functions base URL is different, set `window.API_BASE` before loading `app.js`, e.g.:

```html
<script>window.API_BASE="https://<your-func-name>.azurewebsites.net";</script>
<script type="module" src="./app.js"></script>
