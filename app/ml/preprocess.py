import numpy as np
from scipy import signal

def lowpass_filter(data: np.ndarray, cutoff_hz: float, fs_hz: float, order: int = 2) -> np.ndarray:
    """
    Applies a lowpass Butterworth filter to remove high-frequency noise.
    Commonly used for GSR (EDA) signals.
    """
    nyquist = 0.5 * fs_hz
    normal_cutoff = cutoff_hz / nyquist
    b, a = signal.butter(order, normal_cutoff, btype='low', analog=False)
    filtered_data = signal.filtfilt(b, a, data)
    return filtered_data

def bandpass_filter(data: np.ndarray, lowcut_hz: float, highcut_hz: float, fs_hz: float, order: int = 2) -> np.ndarray:
    """
    Applies a bandpass Butterworth filter to isolate heart rate frequencies.
    Commonly used for PPG pulse waves to remove DC drift and muscle noise.
    """
    nyquist = 0.5 * fs_hz
    low = lowcut_hz / nyquist
    high = highcut_hz / nyquist
    b, a = signal.butter(order, [low, high], btype='band', analog=False)
    filtered_data = signal.filtfilt(b, a, data)
    return filtered_data

def normalize_signal(data: np.ndarray) -> np.ndarray:
    """Standardizes signal to have zero mean and unit variance."""
    mean = np.mean(data)
    std = np.std(data)
    if std == 0:
        return data - mean
    return (data - mean) / std

def separate_gsr_components(raw_gsr: np.ndarray, fs_hz: float) -> tuple:
    """
    Decomposes raw Galvanic Skin Response (GSR) into:
    - Tonic Component (SCL - Skin Conductance Level): Slow-moving baseline.
    - Phasic Component (SCR - Skin Conductance Response): Short, rapid arousal peaks.
    
    Uses a lowpass filter with a very low cutoff frequency (e.g., 0.05 Hz)
    to estimate the SCL, and subtracts it from the filtered raw signal to get SCR.
    """
    # 1. Clean the raw signal of high-frequency noise (1Hz cutoff)
    clean_gsr = lowpass_filter(raw_gsr, cutoff_hz=1.0, fs_hz=fs_hz)
    
    # 2. Extract Tonic (SCL) using a 0.05Hz lowpass filter
    tonic_scl = lowpass_filter(clean_gsr, cutoff_hz=0.05, fs_hz=fs_hz)
    
    # 3. Phasic (SCR) is the high-frequency residue
    phasic_scr = clean_gsr - tonic_scl
    
    # Ensure phasic is non-negative (clipping tiny sub-zero noise)
    phasic_scr = np.clip(phasic_scr, 0, None)
    
    return tonic_scl, phasic_scr

def detect_ppg_peaks(ppg_signal: np.ndarray, fs_hz: float) -> np.ndarray:
    """
    Detects systolic peaks in a Photoplethysmogram (PPG) pulse wave.
    
    Algorithm:
    1. Bandpass filter the signal between 0.5Hz (30 BPM) and 4.0Hz (240 BPM).
    2. Normalize the filtered waveform.
    3. Identify local maxima above an adaptive threshold.
    4. Enforce a refractory period (e.g., 350ms minimum distance between beats) 
       to prevent double-triggering on dicrotic notches.
    
    Returns:
    - NumPy array of peak indices.
    """
    # 1. Bandpass filter to isolate heartbeat frequencies
    filtered = bandpass_filter(ppg_signal, lowcut_hz=0.5, highcut_hz=4.0, fs_hz=fs_hz)
    
    # 2. Normalize
    norm_sig = normalize_signal(filtered)
    
    # 3. Find all local maxima (where signal is greater than its immediate neighbors)
    # y[i] > y[i-1] and y[i] > y[i+1]
    is_maxima = (norm_sig[1:-1] > norm_sig[:-2]) & (norm_sig[1:-1] > norm_sig[2:])
    maxima_indices = np.where(is_maxima)[0] + 1  # adjust for slicing
    
    if len(maxima_indices) == 0:
        return np.array([], dtype=int)
        
    # 4. Filter maxima using adaptive threshold (must be above 0.3 * standard deviation or 0.3 amplitude)
    threshold = 0.3 * np.max(norm_sig)
    candidate_peaks = maxima_indices[norm_sig[maxima_indices] > threshold]
    
    # 5. Enforce refractory period (min distance)
    # At 50Hz, 350ms refractory period = 17 samples (max possible heart rate of 170 BPM)
    min_dist_samples = int(0.35 * fs_hz)
    
    confirmed_peaks = []
    last_peak = -min_dist_samples
    
    for idx in candidate_peaks:
        if idx - last_peak >= min_dist_samples:
            confirmed_peaks.append(idx)
            last_peak = idx
            
    return np.array(confirmed_peaks, dtype=int)

def calculate_ibis_from_peaks(peak_indices: np.ndarray, fs_hz: float) -> np.ndarray:
    """
    Calculates Inter-Beat Intervals (IBIs) in milliseconds from peak sample indices.
    """
    if len(peak_indices) < 2:
        return np.array([], dtype=float)
        
    # Calculate sample differences
    sample_diffs = np.diff(peak_indices)
    
    # Convert samples to milliseconds: diff / sample_rate * 1000
    ibis_ms = (sample_diffs / fs_hz) * 1000.0
    
    return ibis_ms
