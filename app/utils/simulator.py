import time
import math
import random
import numpy as np

class BiosensorSimulator:
    """
    Generates realistic, noisy simulated physiological signals for GSR (EDA) and Pulse (PPG)
    to support off-line testing and development of ML models.
    """
    def __init__(self, noise_level=0.05):
        self.noise_level = noise_level
        self.start_time = time.time()
        
        # State parameters for physiological simulation
        self.states = {
            "REST": {
                "base_bpm": 65.0,
                "hrv_variance": 5.0, # High heart rate variability
                "base_gsr": 3.5,     # Low baseline GSR (SCL) in microSiemens
                "scr_probability": 0.05, # Low spike probability per second
                "scr_amplitude": 0.4
            },
            "STRESSED": {
                "base_bpm": 105.0,
                "hrv_variance": 1.5, # Low HRV (rigid beat-to-beat interval)
                "base_gsr": 11.2,    # High baseline GSR
                "scr_probability": 0.35, # Frequent spontaneous skin conductance spikes
                "scr_amplitude": 1.2
            },
            "EXCITED": {
                "base_bpm": 92.0,
                "hrv_variance": 3.0,
                "base_gsr": 8.0,
                "scr_probability": 0.25,
                "scr_amplitude": 0.8
            }
        }
        self.current_state = "REST"
        
        # Internal state history to generate continuous components
        self.scl_drift = 0.0
        self.active_scrs = [] # list of dicts: {'onset_time': t, 'amplitude': a, 'decay': d}
        self.last_beat_time = time.time()
        self.last_ibi = 0.92  # ~65 bpm in seconds
        
    def set_state(self, state: str):
        """Set simulation state: REST, STRESSED, or EXCITED."""
        if state in self.states:
            self.current_state = state
            
    def get_current_metrics(self) -> dict:
        """
        Returns a snapshot of high-level physiological metrics (BPM, IBI, GSR)
        sampled at the current instantaneous time.
        """
        now = time.time()
        elapsed = now - self.start_time
        params = self.states[self.current_state]
        
        # 1. Heart Rate & Heart Rate Variability simulation
        # Add Respiratory Sinus Arrhythmia (RSA) effect (fluctuation due to breathing)
        rsa = 3.0 * math.sin(2 * math.pi * elapsed / 4.0) # 4 sec breathing cycle
        random_jitter = random.normalvariate(0, params["hrv_variance"])
        current_bpm = params["base_bpm"] + rsa + random_jitter
        current_ibi_ms = (60.0 / current_bpm) * 1000.0 # IBI in milliseconds
        
        # 2. GSR (SCL + SCR) simulation
        # Tonic baseline SCL drifts slowly over time
        self.scl_drift += random.normalvariate(0, 0.01)
        self.scl_drift = np.clip(self.scl_drift, -1.0, 1.0)
        scl = params["base_gsr"] + self.scl_drift
        
        # Spontaneous Phasic spikes (SCR)
        # Try to trigger a new spike
        if random.random() < (params["scr_probability"] * 0.1): # adjusted for sample rate
            self.active_scrs.append({
                "onset_time": elapsed,
                "amplitude": params["scr_amplitude"] * random.uniform(0.7, 1.3),
                "decay_rate": random.uniform(0.1, 0.2)
            })
            
        # Calculate sum of all active phasic SCR events at current time
        scr = 0.0
        remaining_scrs = []
        for event in self.active_scrs:
            t_diff = elapsed - event["onset_time"]
            if t_diff < 0:
                continue
            # Bateman function to model skin conductance response rise and decay
            # SCR(t) = A * (e^(-t/decay) - e^(-t/rise))
            rise_time = 1.5
            decay_time = 1.0 / event["decay_rate"]
            
            # Simple approximation of SCR response curve
            if t_diff < rise_time:
                # Linear/quadratic rise
                val = event["amplitude"] * (t_diff / rise_time)
            else:
                # Exponential decay
                val = event["amplitude"] * math.exp(-(t_diff - rise_time) / decay_time)
                
            if val > 0.01:
                scr += val
                remaining_scrs.append(event)
                
        self.active_scrs = remaining_scrs
        
        total_gsr = scl + scr + random.normalvariate(0, self.noise_level * 0.1)
        
        return {
            "timestamp": now,
            "state": self.current_state,
            "heart_rate_bpm": round(current_bpm, 2),
            "inter_beat_interval_ms": round(current_ibi_ms, 2),
            "gsr_microsiemens": round(max(0.1, total_gsr), 4),
            "eda_tonic_scl": round(scl, 4),
            "eda_phasic_scr": round(scr, 4)
        }
        
    def generate_raw_ppg_wave(self, duration_sec: float, sample_rate_hz: int = 50) -> dict:
        """
        Generates a continuous time-series raw PPG signal array.
        Simulates the dual peak (systolic and diastolic/dicrotic notch) of blood pulse.
        """
        params = self.states[self.current_state]
        num_samples = int(duration_sec * sample_rate_hz)
        t = np.linspace(0, duration_sec, num_samples)
        
        # Calculate instantaneous heart rate frequency (Hz)
        freq = (params["base_bpm"] / 60.0)
        
        # Base PPG wave with systolic and diastolic peaks
        # PPG is typically inverted (higher absorption = lower signal), let's model standard PPG AC component
        wave = np.sin(2 * np.pi * freq * t) + 0.35 * np.sin(4 * np.pi * freq * t - 1.0)
        
        # Add baseline respiration swing (DC component wander)
        dc_wander = 0.5 * np.sin(2 * np.pi * (0.25) * t) # 0.25 Hz respiration (15 breath/min)
        
        # Add high-frequency sensor noise
        noise = np.random.normal(0, self.noise_level, num_samples)
        
        ppg_signal = wave + dc_wander + noise
        
        return {
            "timestamps": (time.time() + t).tolist(),
            "signal": ppg_signal.tolist(),
            "sample_rate": sample_rate_hz
        }
