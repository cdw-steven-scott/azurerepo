from typing import List
from .openai_client import AOAI
from .search_client import VectorSearch

SYS = """You are a concise assistant. Answer using ONLY the provided context. If the answer isn't in the context, say you don't know. Include brief source citations like [doc1]. Tone: clear, direct, helpful."""

class QueryEngine:
    def __init__(self):
        self.aoai = AOAI()
        self.search = VectorSearch()

    def answer(self, user_text: str) -> str:
        q_vec = self.aoai.embed(user_text)
        hits = self.search.search(q_vec, k=4)
        if not hits:
            return "I couldn't find that in the knowledge base yet."
        context_parts = []
        for i, h in enumerate(hits, start=1):
            context_parts.append(f"[doc{i}] {h['content']}\nSOURCE: {h['source']}")
        context = "\n\n".join(context_parts)
        prompt = [
            {"role":"user","content": f"Context:\n{context}\n\nQuestion: {user_text}\nAnswer with citations like [doc1], [doc2]."}
        ]
        return self.aoai.chat(SYS, prompt, max_tokens=700)
