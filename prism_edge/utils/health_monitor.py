"""
System health monitor — tracks CPU, RAM, temperature.
"""

import logging
import time
from typing import Dict, Any

logger = logging.getLogger(__name__)

try:
    import psutil
    HAS_PSUTIL = True
except ImportError:
    HAS_PSUTIL = False
    logger.warning("psutil not installed — health metrics unavailable")


def get_health_snapshot() -> Dict[str, Any]:
    """Return current system health metrics."""
    if not HAS_PSUTIL:
        return {
            "cpu_percent": -1.0,
            "ram_percent": -1.0,
            "temperature_c": -1.0,
            "uptime_sec": -1,
        }

    cpu = psutil.cpu_percent(interval=None)
    ram = psutil.virtual_memory().percent

    # Temperature (Raspberry Pi specific path)
    temp = _read_rpi_temperature()

    uptime = time.time() - psutil.boot_time()

    return {
        "cpu_percent": round(cpu, 1),
        "ram_percent": round(ram, 1),
        "temperature_c": round(temp, 1),
        "uptime_sec": int(uptime),
    }


def _read_rpi_temperature() -> float:
    """Read SoC temperature from Raspberry Pi thermal zone."""
    try:
        with open("/sys/class/thermal/thermal_zone0/temp", "r") as f:
            return float(f.read().strip()) / 1000.0
    except Exception:
        return -1.0
