import pytest
from app import create_app
from app.services.sensor_service import SensorService

@pytest.fixture
def app():
    """Create and configure a new app instance for each test."""
    app = create_app('testing')
    
    # Initialize/Reset sensor service
    sensor_service = SensorService()
    # Reset history
    sensor_service.data_history = []
    
    yield app

@pytest.fixture
def client(app):
    """A test client for the app."""
    return app.test_client()

@pytest.fixture
def runner(app):
    """A test runner for the app's CLI commands."""
    return app.test_cli_runner()
