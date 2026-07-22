from flask import jsonify

class APIException(Exception):
    """Base API Exception for SentinelMind V3.0."""
    status_code = 400

    def __init__(self, message, status_code=None, payload=None):
        super().__init__()
        self.message = message
        if status_code is not None:
            self.status_code = status_code
        self.payload = payload

    def to_dict(self):
        rv = dict(self.payload or ())
        rv['message'] = self.message
        rv['status'] = 'error'
        return rv

class ResourceNotFoundException(APIException):
    status_code = 404

class InvalidPayloadException(APIException):
    status_code = 422

class UnauthorizedException(APIException):
    status_code = 401

def register_error_handlers(app):
    """Registers exception handlers on the Flask app context."""
    
    @app.errorhandler(APIException)
    def handle_api_exception(error):
        response = jsonify(error.to_dict())
        response.status_code = error.status_code
        return response

    @app.errorhandler(404)
    def handle_not_found(error):
        return jsonify({
            'status': 'error',
            'message': 'Resource not found'
        }), 404

    @app.errorhandler(500)
    def handle_internal_server_error(error):
        app.logger.error(f"Unhandled 500 error: {str(error)}")
        return jsonify({
            'status': 'error',
            'message': 'Internal Server Error'
        }), 500
