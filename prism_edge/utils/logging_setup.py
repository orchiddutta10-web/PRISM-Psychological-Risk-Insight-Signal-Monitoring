"""
Structured JSON logging setup for PRISM Edge Node.
"""

import json
import logging
import logging.handlers
import sys
from datetime import datetime, timezone
from pathlib import Path

from prism_edge import config


class JsonFormatter(logging.Formatter):
    """Outputs log records as JSON lines."""

    def format(self, record: logging.LogRecord) -> str:
        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }
        if record.exc_info and record.exc_info[1]:
            log_entry["exception"] = str(record.exc_info[1])

        return json.dumps(log_entry)


def setup_logging() -> None:
    """Configure root logger with JSON output to file and text to console."""
    root = logging.getLogger()
    root.setLevel(getattr(logging, config.LOG_LEVEL.upper(), logging.INFO))

    # Remove existing handlers
    root.handlers.clear()

    # Console handler — human-readable
    console = logging.StreamHandler(sys.stdout)
    console.setLevel(logging.DEBUG)
    console_fmt = logging.Formatter(
        "[%(asctime)s] %(levelname)-7s %(name)-20s %(message)s",
        datefmt="%H:%M:%S",
    )
    console.setFormatter(console_fmt)
    root.addHandler(console)

    # File handler — JSON structured
    config.ensure_directories()
    log_file = config.LOG_DIR / "prism-edge.log"
    file_handler = logging.handlers.RotatingFileHandler(
        str(log_file),
        maxBytes=10 * 1024 * 1024,  # 10 MB
        backupCount=5,
    )
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(JsonFormatter())
    root.addHandler(file_handler)

    logging.captureWarnings(True)

    root.info(
        "Logging initialized (level=%s, dir=%s)", config.LOG_LEVEL, config.LOG_DIR
    )
