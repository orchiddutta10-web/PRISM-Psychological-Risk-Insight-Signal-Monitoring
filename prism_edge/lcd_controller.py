"""
LCD Controller — sends status bytes to the ESP32 PRISM PULSE's 16×2 I2C LCD.

Protocol: single-byte UART commands over the existing ESP32 serial link.

Byte  | Meaning
──────┼─────────
'O'   | ONLINE  — internet available, normal operation
'X'   | OFFLINE — no internet, queuing locally
'S'   | SYNCING — uploading queued data to cloud
'E'   | ERROR   — permanent failure (auth, corruption)
'B'   | BOOTING — Pi startup, initializing
'?'   | UNKNOWN — sent if no explicit status set
"""

import logging
import time
from typing import Optional

logger = logging.getLogger(__name__)

STATUS_BYTE_MAP: dict[str, bytes] = {
    "ONLINE": b"O",
    "OFFLINE": b"X",
    "SYNCING": b"S",
    "ERROR": b"E",
    "BOOTING": b"B",
    "UNKNOWN": b"?",
}


class LCDController:
    """
    Sends status bytes to ESP32 LCD over a shared UART connection.

    Usage:
        lcd = LCDController(serial_port="/dev/ttyUSB0")
        lcd.connect()
        lcd.set_status("ONLINE")
        lcd.close()
    """

    def __init__(self, serial_port: str, baud: int = 115200):
        self._port: str = serial_port
        self._baud: int = baud
        self._ser: Optional[object] = None
        self._current_status: str = "UNKNOWN"

    @property
    def current_status(self) -> str:
        return self._current_status

    def connect(self) -> bool:
        """Open the serial port. Returns True on success."""
        try:
            import serial

            self._ser = serial.Serial(
                self._port, self._baud, timeout=1.0, write_timeout=1.0
            )
            logger.info(
                "LCD controller connected on %s @ %d baud", self._port, self._baud
            )
            return True
        except ImportError:
            logger.warning("pyserial not installed — LCD controller disabled")
            return False
        except Exception as e:
            logger.warning("LCD controller — could not open %s: %s", self._port, e)
            return False

    def set_status(self, status: str) -> None:
        """
        Send a status byte to the ESP32 LCD.

        Args:
            status: One of 'ONLINE', 'OFFLINE', 'SYNCING', 'ERROR', 'BOOTING'.
                    Unknown values send '?'.
        """
        byte = STATUS_BYTE_MAP.get(status, STATUS_BYTE_MAP["UNKNOWN"])
        self._current_status = status if status in STATUS_BYTE_MAP else "UNKNOWN"

        if self._ser and self._ser.is_open:
            try:
                self._ser.write(byte)
            except Exception as e:
                logger.debug("LCD write error: %s", e)
        else:
            logger.debug("LCD not connected — status '%s' not sent", status)

    def close(self) -> None:
        if self._ser and self._ser.is_open:
            try:
                self._ser.close()
            except Exception as e:
                logger.debug("LCD close error: %s", e)
        self._ser = None
