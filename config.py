import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from .env if present
basedir = Path(__file__).resolve().parent
load_dotenv(basedir / '.env')

class Config:
    """Base configurations."""
    SECRET_KEY = os.environ.get('SECRET_KEY', 'sentinelmind-v3-super-secret-key')
    PROJECT_NAME = "SentinelMind V3.0"
    API_V1_PREFIX = "/api/v1"
    
    # Mock Sensor Configs
    SIMULATOR_NOISE_LEVEL = float(os.environ.get('SIMULATOR_NOISE_LEVEL', 0.05))
    SIMULATOR_UPDATE_INTERVAL_MS = int(os.environ.get('SIMULATOR_UPDATE_INTERVAL_MS', 100)) # 10Hz stream
    
    # ML Configs
    MODEL_DIR = basedir / 'app' / 'ml' / 'models'
    DEFAULT_MODEL_PATH = os.environ.get('DEFAULT_MODEL_PATH', str(MODEL_DIR / 'stress_classifier_v1.pkl'))
    FUSION_MODEL_PATH = os.environ.get('FUSION_MODEL_PATH', str(MODEL_DIR / 'sentinel_fusion_v1.pt'))
    PHONE_BUFFER_DAYS = int(os.environ.get('PHONE_BUFFER_DAYS', 7))
    
    # Database
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        'DATABASE_URL', f"sqlite:///{basedir / 'sentinelmind.db'}"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False

class DevelopmentConfig(Config):
    """Development configurations."""
    DEBUG = True
    ENV = 'development'
    SIMULATOR_NOISE_LEVEL = 0.08  # Higher noise for testing robustness in dev

class TestingConfig(Config):
    """Testing configurations."""
    DEBUG = True
    TESTING = True
    ENV = 'testing'
    SQLALCHEMY_DATABASE_URI = 'sqlite:///:memory:'
    SIMULATOR_NOISE_LEVEL = 0.0  # Deterministic mock values for tests

class ProductionConfig(Config):
    """Production configurations."""
    DEBUG = False
    TESTING = False
    ENV = 'production'
    # Ensure SECRET_KEY and DB URI are set in production env
    SECRET_KEY = os.environ.get('SECRET_KEY')
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL')

# Map environment string to config class
config_by_name = {
    'development': DevelopmentConfig,
    'testing': TestingConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig
}
