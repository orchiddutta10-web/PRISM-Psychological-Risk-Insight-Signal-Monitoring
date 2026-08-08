import collections
import threading
import time

from fastapi import HTTPException, Request, status

from app.utils.redis_client import get_redis_client

_MEM_LIMITS = collections.defaultdict(list)
_MEM_LOCK = threading.Lock()


def check_in_memory_limit(ip: str, path: str, limit: int = 5, period: int = 60) -> bool:
    """Fallback thread-safe sliding window rate-limiter in memory."""
    key = f"{ip}:{path}"
    now = time.time()
    with _MEM_LOCK:
        timestamps = [t for t in _MEM_LIMITS[key] if now - t < period]
        if len(timestamps) >= limit:
            return False
        timestamps.append(now)
        _MEM_LIMITS[key] = timestamps
        # Prevent unbounded memory growth: periodically purge stale entries
        if len(_MEM_LIMITS) > 10000:
            stale = [
                k for k, v in _MEM_LIMITS.items() if not v or now - max(v) > period * 10
            ]
            for k in stale:
                del _MEM_LIMITS[k]
        return True


async def rate_limit(request: Request, limit: int = 5, period: int = 60):
    """
    Asynchronous rate limiter dependency.
    Integrates with Redis if available; falls back to sliding-window in-memory tracking.
    Bypassed in non-production environments to avoid test suite lockout.
    """
    from app.config import settings

    if settings.ENV.lower() != "production":
        return

    client_ip = request.client.host if request.client else "127.0.0.1"
    path = request.url.path
    redis_key = f"rate_limit:{client_ip}:{path}"

    try:
        r = get_redis_client()
        # Ping to test connection before executing queries
        await r.ping()
        current = await r.get(redis_key)
        if current and int(current) >= limit:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Rate limit exceeded. Please try again after 60 seconds.",
            )
        pipe = r.pipeline()
        pipe.incr(redis_key)
        pipe.expire(redis_key, period)
        await pipe.execute()
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        # Redis connection failed/unavailable, fallback to in-memory limits
        allowed = check_in_memory_limit(client_ip, path, limit, period)
        if not allowed:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Rate limit exceeded. Please try again after 60 seconds.",
            )
