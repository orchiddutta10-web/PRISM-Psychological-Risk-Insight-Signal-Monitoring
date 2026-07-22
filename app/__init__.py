import os
from flask import Flask, jsonify
from flask_cors import CORS
from config import config_by_name
from app.core.exceptions import register_error_handlers

def create_app(config_name: str = None) -> Flask:
    """
    Application factory for SentinelMind V3.0.
    """
    app = Flask(__name__)
    
    # Load configuration
    if not config_name:
        config_name = os.environ.get('FLASK_ENV', 'development')
    app.config.from_object(config_by_name.get(config_name, config_by_name['default']))
    
    # Initialize Extensions
    CORS(app, resources={r"/api/*": {"origins": "*"}})
    
    # Register Error Handlers
    register_error_handlers(app)
    
    # Register Blueprints
    from app.api.v1 import api_v1_bp
    app.register_blueprint(api_v1_bp, url_prefix=app.config['API_V1_PREFIX'])
    
    @app.route('/health', methods=['GET'])
    def health_check():
        """Basic health check endpoint."""
        return jsonify({
            "status":      "online",
            "project":     app.config['PROJECT_NAME'],
            "environment": app.config['ENV']
        }), 200

    @app.route('/dashboard')
    def serve_dashboard():
        """Serve the live metrics dashboard UI."""
        from flask import render_template
        return render_template('dashboard.html')
        
    # Pre-load/initialize ML model service inside application context
    with app.app_context():
        from app.services.ml_service import MLService
        ml_service = MLService()
        ml_service.load_model()
        
    return app
