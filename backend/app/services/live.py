import asyncio
import logging


class ConnectionManager:
    def __init__(self):
        self.connections = set()
        self.lock = asyncio.Lock()

    async def broadcast(self, message):
        async with self.lock:
            async def send(socket):
                try:
                    await asyncio.wait_for(socket.send_json(message), timeout=2)
                except Exception:
                    self.connections.discard(socket)
                    logging.getLogger(__name__).warning("Disconnected WebSocket client")
            await asyncio.gather(*(send(socket) for socket in tuple(self.connections)))


manager = ConnectionManager()
