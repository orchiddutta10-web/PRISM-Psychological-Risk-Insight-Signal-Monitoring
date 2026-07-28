import warnings
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import models
from app.database import Base, get_db
from app.main import app

# Suppress upstream Starlette deprecation warning about httpx vs httpx2
warnings.filterwarnings(
    "ignore", message=".*httpx.*testclient.*deprecated.*", module="starlette.testclient"
)
# Suppress sklearn feature-names warning from numpy arrays passed to pandas-fitted models
warnings.filterwarnings(
    "ignore", message="X does not have valid feature names"
)

# ── Shared in-memory SQLite engine for all tests ─────────────────────
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
_test_engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_test_engine)


@pytest.fixture(scope="function", autouse=True)
def setup_db():
    """Fresh schema + seed data before each test."""
    Base.metadata.drop_all(bind=_test_engine)
    Base.metadata.create_all(bind=_test_engine)
    from app.utils.risk_registry import seed_registry

    db = TestingSessionLocal()
    seed_registry(db)
    db.close()
    yield
    Base.metadata.drop_all(bind=_test_engine)


def _override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()


# Register the override once — all test modules share it
app.dependency_overrides[get_db] = _override_get_db


@pytest.fixture(autouse=True)
def mock_redis(monkeypatch):
    """Automatically mock the Redis client globally for all tests."""
    mock_client = AsyncMock()
    mock_client.publish = AsyncMock(return_value=1)

    monkeypatch.setattr("app.routes.telemetry.get_redis_client", lambda: mock_client)
    monkeypatch.setattr("app.routes.physio.get_redis_client", lambda: mock_client)
    monkeypatch.setattr("app.utils.ml_engine.get_redis_client", lambda: mock_client)
