from botbuilder.core import ActivityHandler, TurnContext, MessageFactory
from botbuilder.schema import ChannelAccount
from .query_engine import QueryEngine

class QABot(ActivityHandler):
    def __init__(self):
        self.engine = QueryEngine()

    async def on_message_activity(self, turn_context: TurnContext):
        text = (turn_context.activity.text or "").strip()
        if not text:
            await turn_context.send_activity("Say something like: 'What is our return policy?' ")
            return
        answer = self.engine.answer(text)
        await turn_context.send_activity(MessageFactory.text(answer))

    async def on_members_added_activity(self, members_added: list[ChannelAccount], turn_context: TurnContext):
        for member in members_added:
            if member.id != turn_context.activity.recipient.id:
                await turn_context.send_activity("Hi! Ask me something from the knowledge base.")
