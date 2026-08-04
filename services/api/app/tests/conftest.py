import pytest
import warnings
from unittest.mock import AsyncMock

from app.config import settings

# The test suite makes many rapid calls to the same auth endpoints from one
# testclient IP; disable rate limiting to avoid self-lockout. Rate limiting is
# enabled by default in all environments (see app/utils/rate_limiter.py).
settings.RATE_LIMIT_ENABLED = False

# Suppress upstream Starlette deprecation warning about httpx vs httpx2
warnings.filterwarnings(
    "ignore", message=".*httpx.*testclient.*deprecated.*", module="starlette.testclient"
)


@pytest.fixture(autouse=True)
def mock_redis(monkeypatch):
    """Automatically mock the Redis client globally for all tests."""
    mock_client = AsyncMock()
    mock_client.publish = AsyncMock(return_value=1)

    monkeypatch.setattr("app.routes.telemetry.get_redis_client", lambda: mock_client)
    monkeypatch.setattr("app.routes.physio.get_redis_client", lambda: mock_client)
    monkeypatch.setattr("app.utils.ml_engine.get_redis_client", lambda: mock_client)
