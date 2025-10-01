import os, uuid, glob, sys
from typing import Iterator
from azure.core.credentials import AzureKeyCredential
from azure.search.documents.indexes import SearchIndexClient
from azure.search.documents import SearchClient
from pypdf import PdfReader
from openai import OpenAI
from index_schema import build_index

INDEX = os.getenv("SEARCH_INDEX", "kb-index")
SEARCH_ENDPOINT = os.environ["SEARCH_ENDPOINT"]
SEARCH_KEY = os.environ["SEARCH_KEY"]
AOAI_ENDPOINT = os.environ["AOAI_ENDPOINT"]
AOAI_KEY = os.environ["AOAI_KEY"]
EMBED_DEPLOY = os.getenv("OPENAI_EMBEDDINGS", "embed-deploy")
API_VERSION = os.getenv("AZURE_OPENAI_API_VERSION", "2024-06-01")

client = OpenAI(azure_endpoint=AOAI_ENDPOINT, api_key=AOAI_KEY, api_version=API_VERSION)

def read_pdf(path: str) -> str:
    reader = PdfReader(path)
    return "\n".join(p.extract_text() or "" for p in reader.pages)

def read_txt(path: str) -> str:
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        return f.read()

def chunk(text: str, max_chars: int = 1500, overlap: int = 200):
    i = 0
    n = len(text)
    while i < n:
        j = min(i + max_chars, n)
        yield text[i:j]
        i = j - overlap
        if i < 0: i = 0

# --- create index if needed ---
idx_client = SearchIndexClient(SEARCH_ENDPOINT, AzureKeyCredential(SEARCH_KEY))
existing = [i.name for i in idx_client.list_indexes()]
if INDEX not in existing:
    dims = int(os.getenv("EMBEDDING_DIMS", "1536"))
    idx = build_index(INDEX, dims=dims)
    idx_client.create_index(idx)
    print(f"Created index '{INDEX}' with dims={dims}")

sclient = SearchClient(SEARCH_ENDPOINT, INDEX, AzureKeyCredential(SEARCH_KEY))

# --- gather docs from ../data ---
data_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data"))
if not os.path.isdir(data_dir):
    print(f"Data folder not found: {data_dir}")
    sys.exit(1)

records = []
for path in glob.glob(os.path.join(data_dir, "**", "*"), recursive=True):
    if os.path.isdir(path):
        continue
    ext = os.path.splitext(path)[1].lower()
    if ext in [".pdf", ".txt", ".md"]:
        text = read_pdf(path) if ext == ".pdf" else read_txt(path)
        for i, ch in enumerate(chunk(text)):
            emb = client.embeddings.create(model=EMBED_DEPLOY, input=ch).data[0].embedding
            records.append({
                "id": f"{uuid.uuid4()}",
                "content": ch,
                "source": os.path.basename(path),
                "contentVector": emb
            })

if records:
    print(f"Uploading {len(records)} chunks to index {INDEX}...")
    sclient.upload_documents(records)
    print("Done.")
else:
    print("No documents found in ../data/")
