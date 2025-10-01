import os
from aiohttp import web
from botbuilder.core import BotFrameworkAdapterSettings, BotFrameworkAdapter, TurnContext
from botbuilder.schema import Activity
from .kv import get_secret

# Prefer Key Vault, fall back to env for local dev
APP_ID = os.getenv("MicrosoftAppId") or get_secret("ms-app-id")
APP_PASSWORD = os.getenv("MicrosoftAppPassword") or get_secret("ms-app-password")

settings = BotFrameworkAdapterSettings(APP_ID, APP_PASSWORD)
adapter = BotFrameworkAdapter(settings)

async def messages(req: web.Request, bot) -> web.Response:
    body = await req.json()
    activity = Activity().deserialize(body)
    auth_header = req.headers.get("Authorization", "")

    async def aux_func(turn_context: TurnContext):
        await bot.on_turn(turn_context)

    await adapter.process_activity(activity, auth_header, aux_func)
    return web.Response(status=201)
