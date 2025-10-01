import os
from aiohttp import web
from .adapter import messages
from .bot import QABot

app = web.Application()
_bot = QABot()
app.router.add_post("/api/messages", lambda req: messages(req, _bot))

# health probe for Azure
async def healthz(request):
    return web.Response(text="ok")

app.router.add_get("/healthz", healthz)

if __name__ == "__main__":
    port = int(os.getenv("PORT", 3978))
    web.run_app(app, host="0.0.0.0", port=port)
