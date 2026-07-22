import time
from collections import deque

class LogService:
    """
    In-memory log service for SentinelMind V3.0.
    Tracks anomaly events and voice command logs using fixed-size ring buffers.
    """
    _instance = None

    def __new__(cls, *args, **kwargs):
        if not cls._instance:
            cls._instance = super(LogService, cls).__new__(cls, *args, **kwargs)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self, max_entries: int = 100):
        if self._initialized:
            return
        self.anomaly_log = deque(maxlen=max_entries)
        self.voice_log   = deque(maxlen=max_entries)
        self._initialized = True
        self._seed_demo_data()

    def _seed_demo_data(self):
        """Populate with realistic demo entries so the dashboard is non-empty on first load."""
        now = time.time()
        demo_anomalies = [
            {"timestamp": now - 420, "type": "HIGH_GSR",       "severity": "warning",  "message": "GSR spike detected: 14.2 μS (threshold: 10 μS)"},
            {"timestamp": now - 310, "type": "LOW_HRV",        "severity": "warning",  "message": "RMSSD dropped to 18 ms — elevated sympathetic activity"},
            {"timestamp": now - 180, "type": "STRESS_PEAK",    "severity": "critical", "message": "State classified as STRESSED for 3 consecutive windows"},
            {"timestamp": now -  90, "type": "HIGH_HEART_RATE","severity": "warning",  "message": "Heart rate peaked at 112 BPM"},
            {"timestamp": now -  20, "type": "NORMALISED",     "severity": "info",     "message": "Physiological state returned to REST baseline"},
        ]
        demo_voice = [
            {"timestamp": now - 600, "command": "hello",               "response": "Hello. I am Sentinel, your local physiological monitoring assistant.", "intent": "greeting"},
            {"timestamp": now - 480, "command": "how am i doing",      "response": "Checking your biosensor status. Please hold.",                        "intent": "stress_check"},
            {"timestamp": now - 300, "command": "what is my heart rate","response": "Your current heart rate is 104 beats per minute.",                    "intent": "heart_rate_query"},
            {"timestamp": now -  60, "command": "how am i",            "response": "Alert. I detected signs of elevated stress.",                          "intent": "stress_check"},
        ]
        for a in demo_anomalies:
            self.anomaly_log.append(a)
        for v in demo_voice:
            self.voice_log.append(v)

    def add_anomaly(self, anomaly_type: str, message: str, severity: str = "warning"):
        self.anomaly_log.append({
            "timestamp": time.time(),
            "type":      anomaly_type,
            "severity":  severity,
            "message":   message
        })

    def add_voice_log(self, command: str, response: str, intent: str = "unknown"):
        self.voice_log.append({
            "timestamp": time.time(),
            "command":   command,
            "response":  response,
            "intent":    intent
        })

    def get_anomalies(self, limit: int = 20) -> list:
        return sorted(list(self.anomaly_log), key=lambda x: x["timestamp"], reverse=True)[:limit]

    def get_voice_logs(self, limit: int = 20) -> list:
        return sorted(list(self.voice_log), key=lambda x: x["timestamp"], reverse=True)[:limit]
