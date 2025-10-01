# QA Bot Scaffold

Unzip this folder anywhere, e.g. `%USERPROFILE%\qabot`.

## Local ingest
1. Put a couple docs in `data/` (pdf/md/txt).
2. Open PowerShell:
   ```powershell
   $repo = Join-Path $env:USERPROFILE 'qabot'
   Set-Location "$repo\ingest"
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install --upgrade pip
   pip install openai==1.43.0 azure-search-documents==11.6.0b4 pypdf==4.3.1

   $env:SEARCH_ENDPOINT = (az keyvault secret show --vault-name stevenkeymaster --name search-endpoint --query value -o tsv)
   $env:SEARCH_KEY      = (az keyvault secret show --vault-name stevenkeymaster --name search-key      --query value -o tsv)
   $env:AOAI_ENDPOINT   = (az keyvault secret show --vault-name stevenkeymaster --name aoai-endpoint   --query value -o tsv)
   $env:AOAI_KEY        = (az keyvault secret show --vault-name stevenkeymaster --name aoai-key        --query value -o tsv)
   $env:OPENAI_EMBEDDINGS = "embed-deploy"
   $env:SEARCH_INDEX      = "kb-index"
   $env:EMBEDDING_DIMS    = "1536"   # use 3072 if you deploy text-embedding-3-large
   python .\ingest.py
   ```

## Startup command (App Service)
```
az webapp config set -g stevenRG -n app-steven-qa --startup-file "python -m bot.app"
```
