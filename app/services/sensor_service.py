from app.utils.simulator import BiosensorSimulator
import time

class SensorService:
    """
    Service layer to handle fetching and buffering of biosensor data.
    Provides a seamless interface that abstracts whether data is coming from
    the simulator or live physical sensor endpoints.
    """
    _instance = None
    
    def __new__(cls, *args, **kwargs):
        if not cls._instance:
            cls._instance = super(SensorService, cls).__new__(cls, *args, **kwargs)
            cls._instance._initialized = False
        return cls._instance
        
    def __init__(self, noise_level=0.05):
        if self._initialized:
            return
        # Initialize simulator for local/mock development
        self.simulator = BiosensorSimulator(noise_level=noise_level)
        self.data_history = []
        self.max_history_len = 1000
        self._initialized = True
        
    def get_latest_reading(self) -> dict:
        """
        Retrieves the latest instantaneous biosensor reading.
        Can support database cache fallback or direct hardware polling.
        """
        reading = self.simulator.get_current_metrics()
        
        # Buffer readings for sliding-window feature extraction
        self.data_history.append(reading)
        if len(self.data_history) > self.max_history_len:
            self.data_history.pop(0)
            
        return reading
        
    def get_raw_waves(self, duration_sec: float = 5.0) -> dict:
        """Retrieves raw pulse waveforms for signal processing."""
        return self.simulator.generate_raw_ppg_wave(duration_sec=duration_sec)
        
    def change_user_state(self, state: str) -> bool:
        """
        Simulates changes in physical arousal state (REST, STRESSED, EXCITED).
        In production, this would represent triggering external stimuli or markers.
        """
        if state in ["REST", "STRESSED", "EXCITED"]:
            self.simulator.set_state(state)
            return True
        return False

    def get_buffered_readings(self, count: int = 100) -> list:
        """Returns the last N buffered readings."""
        return self.data_history[-count:]
