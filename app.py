import os
from app import create_app

# Create app using the environment variable or default to development
config_name = os.environ.get('FLASK_ENV', 'development')
app = create_app(config_name)

if __name__ == '__main__':
    # Retrieve host and port configuration
    host = os.environ.get('FLASK_RUN_HOST', '0.0.0.0')
    port = int(os.environ.get('FLASK_RUN_PORT', 5000))
    
    app.logger.info(f"Starting {app.config['PROJECT_NAME']} server on {host}:{port} in {config_name} mode...")
    app.run(host=host, port=port)
