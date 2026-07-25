import pytest
import warnings
from unittest.mock import AsyncMock

# Suppress upstream Starlette deprecation warning about httpx vs httpx2
warnings.filterwarnings("ignore", message=".*httpx.*testclient.*deprecated.*", module="starlette.testclient")

@pytest.fixture(autouse=True)
def mock_redis(monkeypatch):
    """Automatically mock the Redis client globally for all tests."""
    mock_client = AsyncMock()
    mock_client.publish = AsyncMock(return_value=1)
    
    monkeypatch.setattr("app.routes.telemetry.get_redis_client", lambda: mock_client)
    monkeypatch.setattr("app.routes.physio.get_redis_client", lambda: mock_client)
    monkeypatch.setattr("app.utils.ml_engine.get_redis_client", lambda: mock_client)
