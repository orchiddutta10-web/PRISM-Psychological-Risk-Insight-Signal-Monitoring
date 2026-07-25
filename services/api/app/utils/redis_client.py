import asyncio
import logging
from typing import Dict, Set
import redis.asyncio as aioredis
from app.config import settings

logger = logging.getLogger(__name__)

# Global in-memory storage and pubsub channels for the mock
_mem_db: Dict[str, str] = {}
_subscribers: Dict[str, Set[asyncio.Queue]] = {}

class MockPubSub:
    def __init__(self):
        self.subscribed_channels: Set[str] = set()
        self.queue: asyncio.Queue = asyncio.Queue()

    async def subscribe(self, *channels):
        for chan in channels:
            self.subscribed_channels.add(chan)
            if chan not in _subscribers:
                _subscribers[chan] = set()
            _subscribers[chan].add(self.queue)

    async def unsubscribe(self, *channels):
        for chan in channels:
            if chan in self.subscribed_channels:
                self.subscribed_channels.remove(chan)
                if chan in _subscribers:
                    _subscribers[chan].discard(self.queue)

    async def get_message(self, ignore_subscribe_messages=True, timeout=1.0):
        try:
            msg = await asyncio.wait_for(self.queue.get(), timeout=timeout)
            return msg
        except asyncio.TimeoutError:
            return None

class MockRedisClient:
    async def ping(self):
        return True

    async def get(self, key: str):
        return _mem_db.get(key)

    async def set(self, key: str, value: str, ex=None):
        _mem_db[key] = str(value)
        return True

    async def publish(self, channel: str, message: str):
        msg = {
            "type": "message",
            "channel": channel,
            "data": message
        }
        if channel in _subscribers:
            for q in _subscribers[channel]:
                await q.put(msg)
        return 1

    def pubsub(self):
        return MockPubSub()

    def pipeline(self):
        return MockPipeline(self)

class MockPipeline:
    def __init__(self, client):
        self.client = client
        self.commands = []

    def incr(self, key):
        self.commands.append(("incr", key))
        return self

    def expire(self, key, period):
        self.commands.append(("expire", key, period))
        return self

    async def execute(self):
        results = []
        for cmd, *args in self.commands:
            if cmd == "incr":
                key = args[0]
                val = int(_mem_db.get(key, 0)) + 1
                _mem_db[key] = str(val)
                results.append(val)
            elif cmd == "expire":
                results.append(True)
        self.commands = []
        return results

class LazyPubSub:
    def __init__(self, lazy_client):
        self.lazy_client = lazy_client
        self._real_pubsub = None
        self._mock_pubsub = None

    async def _get_pubsub(self):
        client = await self.lazy_client._get_active_client()
        if isinstance(client, MockRedisClient):
            if self._mock_pubsub is None:
                self._mock_pubsub = client.pubsub()
            return self._mock_pubsub
        else:
            if self._real_pubsub is None:
                self._real_pubsub = client.pubsub()
            return self._real_pubsub

    async def subscribe(self, *channels):
        ps = await self._get_pubsub()
        return await ps.subscribe(*channels)

    async def unsubscribe(self, *channels):
        ps = await self._get_pubsub()
        return await ps.unsubscribe(*channels)

    async def get_message(self, ignore_subscribe_messages=True, timeout=1.0):
        ps = await self._get_pubsub()
        return await ps.get_message(ignore_subscribe_messages=ignore_subscribe_messages, timeout=timeout)

class LazyPipeline:
    def __init__(self, lazy_client):
        self.lazy_client = lazy_client
        self.commands = []

    def incr(self, key):
        self.commands.append(("incr", key))
        return self

    def expire(self, key, period):
        self.commands.append(("expire", key, period))
        return self

    async def execute(self):
        client = await self.lazy_client._get_active_client()
        if isinstance(client, MockRedisClient):
            mock_pipe = client.pipeline()
            mock_pipe.commands = self.commands
            res = await mock_pipe.execute()
            self.commands = []
            return res
        else:
            real_pipe = client.pipeline()
            for cmd, *args in self.commands:
                if cmd == "incr":
                    real_pipe.incr(*args)
                elif cmd == "expire":
                    real_pipe.expire(*args)
            res = await real_pipe.execute()
            self.commands = []
            return res

class LazyFallbackRedisClient:
    def __init__(self):
        self._real_client = None
        self._mock_client = None
        self._use_mock = False
        self._lock = asyncio.Lock()

    async def _get_active_client(self):
        async with self._lock:
            if self._use_mock:
                if self._mock_client is None:
                    self._mock_client = MockRedisClient()
                return self._mock_client

            if self._real_client is None:
                try:
                    self._real_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
                    # Try to ping the real Redis server with a short timeout
                    await asyncio.wait_for(self._real_client.ping(), timeout=1.0)
                    logger.info("Successfully connected to Redis at %s", settings.REDIS_URL)
                except Exception as e:
                    logger.warning("Could not connect to Redis at %s: %s. Falling back to in-memory MockRedisClient.", settings.REDIS_URL, e)
                    self._use_mock = True
                    self._mock_client = MockRedisClient()
                    return self._mock_client

            return self._real_client

    async def ping(self):
        client = await self._get_active_client()
        return await client.ping()

    async def get(self, key):
        client = await self._get_active_client()
        return await client.get(key)

    async def set(self, key, value, ex=None):
        client = await self._get_active_client()
        return await client.set(key, value, ex=ex)

    async def publish(self, channel, message):
        client = await self._get_active_client()
        return await client.publish(channel, message)

    def pubsub(self, **kwargs):
        return LazyPubSub(self)

    def pipeline(self):
        return LazyPipeline(self)

redis_client = LazyFallbackRedisClient()

def get_redis_client() -> LazyFallbackRedisClient:
    return redis_client

