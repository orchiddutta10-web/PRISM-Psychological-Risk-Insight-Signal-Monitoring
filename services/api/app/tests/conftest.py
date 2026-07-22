import pytest
from unittest.mock import AsyncMock

@pytest.fixture(autouse=True)
def mock_redis(monkeypatch):
    """Automatically mock the Redis client globally for all tests."""
    mock_client = AsyncMock()
    mock_client.publish = AsyncMock(return_value=1)
    
    # Mock get_redis_client where it is imported and used
    monkeypatch.setattr("app.routes.telemetry.get_redis_client", lambda: mock_client)
    monkeypatch.setattr("app.utils.ml_engine.get_redis_client", lambda: mock_client)
