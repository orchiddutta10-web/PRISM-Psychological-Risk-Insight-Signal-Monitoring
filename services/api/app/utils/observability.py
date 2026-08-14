import json
import logging
import sys
import time

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response


# 1. Custom JSON Structured Logging Formatter
class JSONFormatter(logging.Formatter):
    def format(self, record):
        log_entry = {
            "timestamp": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info:
            log_entry["exception"] = self.formatException(record.exc_info)
        # Include custom attributes if present
        if hasattr(record, "extra_data"):
            log_entry["extra_data"] = record.extra_data
        return json.dumps(log_entry)


def setup_structured_logging():
    """Configure python logger to output structured JSON logs to stdout."""
    logger = logging.getLogger()
    logger.setLevel(logging.INFO)

    # Clean up existing handlers
    for handler in logger.handlers[:]:
        logger.removeHandler(handler)

    handler = logging.StreamHandler(sys.stdout)
    formatter = JSONFormatter()
    handler.setFormatter(formatter)
    logger.addHandler(handler)

    logging.getLogger("uvicorn.access").disabled = True  # Avoid log duplication


# 2. APM & Performance Monitoring Middleware
def _redact_path(path: str) -> str:
    """Strip the query string (may contain tokens/PII) from a URL path for logging."""
    return path.split("?", 1)[0]


def _redact_error(exc: Exception) -> str:
    """Log the exception type, not the full message (may contain PII)."""
    return type(exc).__name__


class APMMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        start_time = time.perf_counter()

        # Capture trace metadata (query string redacted)
        path = _redact_path(request.url.path)
        method = request.method

        try:
            response = await call_next(request)
            process_time_ms = (time.perf_counter() - start_time) * 1000

            # Log APM performance trace metrics
            logging.info(
                f"APM TRACE: {method} {path} completed in {process_time_ms:.2f}ms with status {response.status_code}",
                extra={
                    "extra_data": {
                        "method": method,
                        "path": path,
                        "latency_ms": round(process_time_ms, 2),
                        "status_code": response.status_code,
                        "type": "apm_metrics",
                    }
                },
            )
            return response

        except Exception as e:
            process_time_ms = (time.perf_counter() - start_time) * 1000
            safe_err = _redact_error(e)
            logging.error(
<<<<<<< HEAD
                f"APM TRACE ERROR: {method} {path} failed after {process_time_ms:.2f}ms due to: {e!s}",
=======
                f"APM TRACE ERROR: {method} {path} failed after {process_time_ms:.2f}ms due to: {safe_err}",
>>>>>>> feature/dashboard-ui
                exc_info=True,
                extra={
                    "extra_data": {
                        "method": method,
                        "path": path,
                        "latency_ms": round(process_time_ms, 2),
                        "error": safe_err,
                        "type": "apm_error",
                    }
                },
            )
            trigger_critical_alert(
<<<<<<< HEAD
                error_msg=f"HTTP endpoint {method} {path} failed: {e!s}",
=======
                error_msg=f"HTTP endpoint {method} {path} failed: {safe_err}",
>>>>>>> feature/dashboard-ui
                context={"latency_ms": process_time_ms},
            )
            raise e


# 3. Structured Critical Alerting System
def trigger_critical_alert(error_msg: str, context: dict = None):
    """
    Dispatches automated alerts for critical operational failures.
    Outputs highly visible JSON payloads to alerting integrations (PagerDuty/Slack/OpsGenie).
    """
    alert_payload = {
        "alert_id": f"CRIT-{int(time.time())}",
        "severity": "CRITICAL",
        "service": "prism-backend-api",
        "summary": error_msg,
        "context": context or {},
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    # Log the alert format cleanly so unified cloud logs pick it up
    logging.error(
        f"[AUTOMATED ALERT] CRITICAL OPERATIONAL FAILURE: {error_msg}",
        extra={"extra_data": alert_payload},
    )
    # Dispatch via the structured logger instead of stdout.
    logging.getLogger(__name__).info(
        "Ops webhook dispatch: %s", json.dumps(alert_payload)
    )
