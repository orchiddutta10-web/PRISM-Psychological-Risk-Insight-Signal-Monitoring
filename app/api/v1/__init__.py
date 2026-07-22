from flask import Blueprint
from app.api.v1.sensors import sensors_bp
from app.api.v1.ml import ml_bp
from app.api.v1.dashboard import dashboard_bp
from app.api.v1.hardware import hardware_bp
from app.api.v1.phone import phone_bp

# Aggregated v1 api blueprint
api_v1_bp = Blueprint('api_v1', __name__)

# Register child blueprints
api_v1_bp.register_blueprint(sensors_bp,   url_prefix='/sensors')
api_v1_bp.register_blueprint(ml_bp,        url_prefix='/ml')
api_v1_bp.register_blueprint(dashboard_bp, url_prefix='/dashboard')
api_v1_bp.register_blueprint(hardware_bp,  url_prefix='/hardware')
api_v1_bp.register_blueprint(phone_bp,     url_prefix='/phone')
