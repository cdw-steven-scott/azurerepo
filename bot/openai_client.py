import os
from openai import OpenAI
from .kv import get_secret

API_VERSION = os.getenv("AZURE_OPENAI_API_VERSION", "2024-06-01")

class AOAI:
    def __init__(self):
        # Prefer Key Vault; fall back to env (for local dev)
        endpoint = os.getenv("AOAI_ENDPOINT") or get_secret("aoai-endpoint")
        key = os.getenv("AOAI_KEY") or get_secret("aoai-key")
        self.chat_deployment = os.getenv("OPENAI_DEPLOYMENT", "chat-deploy")
        self.embed_deployment = os.getenv("OPENAI_EMBEDDINGS", "embed-deploy")
        self.client = OpenAI(azure_endpoint=endpoint, api_key=key, api_version=API_VERSION)

    def embed(self, text: str):
        res = self.client.embeddings.create(model=self.embed_deployment, input=text)
        return res.data[0].embedding

    def chat(self, system: str, messages: list[dict], max_tokens: int = 600):
        msgs = [{"role":"system","content":system}] + messages
        resp = self.client.chat.completions.create(
            model=self.chat_deployment,
            messages=msgs,
            temperature=0.3,
            max_tokens=max_tokens
        )
        return resp.choices[0].message.content
