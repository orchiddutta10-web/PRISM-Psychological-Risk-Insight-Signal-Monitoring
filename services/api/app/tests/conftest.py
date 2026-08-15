import pytest
import warnings
from unittest.mock import AsyncMock

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

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


# ─── Shared in-memory SQLite engine (single connection across all test files) ─

from app.database import Base  # noqa: E402
from app.utils.risk_registry import seed_registry  # noqa: E402

TEST_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    # StaticPool shares ONE connection so all test files see the same tables
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="session", autouse=True)
def create_tables_once():
    """Create all tables once per pytest session on the shared engine."""
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function", autouse=True)
def setup_db(create_tables_once):
    """Reset + reseed the DB before every test."""
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    seed_registry(db)
    db.close()
    yield


def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()
