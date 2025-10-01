import os
from typing import List, Dict
from azure.core.credentials import AzureKeyCredential
from azure.search.documents import SearchClient
from azure.search.documents.models import VectorizedQuery
from .kv import get_secret

class VectorSearch:
    def __init__(self):
        endpoint = os.getenv("SEARCH_ENDPOINT") or get_secret("search-endpoint")
        key = os.getenv("SEARCH_KEY") or get_secret("search-key")
        index = os.getenv("SEARCH_INDEX", "kb-index")
        self.client = SearchClient(endpoint=endpoint, index_name=index, credential=AzureKeyCredential(key))

    def search(self, embedding: list[float], k: int = 4) -> List[Dict]:
        vq = VectorizedQuery(vector=embedding, k_nearest_neighbors=k, fields="contentVector")
        results = self.client.search(search_text=None, vector_queries=[vq], select=["id","content","source"])
        out = []
        for r in results:
            out.append({"id": r["id"], "content": r["content"], "source": r.get("source","unknown")})
        return out
