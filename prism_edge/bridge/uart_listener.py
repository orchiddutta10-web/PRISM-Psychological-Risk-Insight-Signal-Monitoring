import logging
import threading
import time
import json

try:
    import serial
except ImportError:
    serial = None

from prism_edge import config

logger = logging.getLogger(__name__)

class UARTListener(threading.Thread):
    """
    Listens for telemetry from ESP32 over UART/Serial.
    This provides an alternative to Wi-Fi for edge node connectivity.
    """
    def __init__(self, shared_state, state_lock, port="/dev/ttyUSB0", baudrate=115200):
        super().__init__(name="uart-listener", daemon=True)
        self.shared_state = shared_state
        self.state_lock = state_lock
        self.port = port
        self.baudrate = baudrate
        self.running = False
        self.serial_conn = None

    def run(self):
        if serial is None:
            logger.warning("pyserial not installed, UART listener disabled")
            return

        self.running = True
        logger.info(f"Starting UART listener on {self.port} at {self.baudrate} baud")

        while self.running:
            try:
                if self.serial_conn is None:
                    self.serial_conn = serial.Serial(self.port, self.baudrate, timeout=1.0)
                
                line = self.serial_conn.readline()
                if line:
                    self._process_payload(line.decode('utf-8', errors='ignore').strip())
            except serial.SerialException as e:
                logger.error(f"UART Error: {e}")
                self.serial_conn = None
                time.sleep(2.0)
            except Exception as e:
                logger.error(f"Unexpected UART error: {e}")
                time.sleep(1.0)

    def _process_payload(self, line: str):
        if not line:
            return

        # Try JSON first
        if line.startswith("{"):
            try:
                payload = json.loads(line)
                if "bpm" in payload and "pulse_raw" in payload:
                    with self.state_lock:
                        self.shared_state["esp32_pulse"] = {
                            "ts_ms": payload.get("ts_ms", int(time.time() * 1000)),
                            "pulse_raw": int(payload["pulse_raw"]),
                            "bpm": float(payload["bpm"]),
                            "g_force": float(payload.get("g_force", 1.0)),
                            "alert_status": str(payload.get("alert_status", "OK"))[:32],
                        }
                    logger.debug(f"UART pulse (JSON): bpm={payload['bpm']}")
                return
            except json.JSONDecodeError:
                pass

        # Try CSV: ts_ms,pulse_raw,bpm,g_force,alert_status
        parts = line.split(",")
        if len(parts) >= 5:
            try:
                ts_ms = int(parts[0])
                pulse_raw = int(parts[1])
                bpm = float(parts[2])
                g_force = float(parts[3])
                alert_status = parts[4].strip()[:32]
                with self.state_lock:
                    self.shared_state["esp32_pulse"] = {
                        "ts_ms": ts_ms,
                        "pulse_raw": pulse_raw,
                        "bpm": bpm,
                        "g_force": g_force,
                        "alert_status": alert_status,
                    }
                logger.debug(f"UART pulse (CSV): bpm={bpm} g={g_force:.2f} {alert_status}")
            except (ValueError, IndexError):
                pass

    def stop(self):
        self.running = False
        if self.serial_conn:
            self.serial_conn.close()
