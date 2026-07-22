import pytest
import numpy as np
from app.ml.preprocess import (
    separate_gsr_components,
    detect_ppg_peaks,
    calculate_ibis_from_peaks,
    normalize_signal
)
from app.ml.feature_extractor import extract_hrv_features

def test_separate_gsr_components():
    """Verify that SCL and SCR are separated correctly from a synthetic GSR signal."""
    fs = 10.0  # 10Hz sampling rate
    duration = 60.0
    t = np.linspace(0, duration, int(fs * duration), endpoint=False)
    
    # 1. Create a slow-drifting SCL tonic baseline (0.01Hz wave)
    true_scl = 5.0 + 2.0 * np.sin(2 * np.pi * 0.005 * t)
    
    # 2. Create Phasic SCR spikes (exponential decay events triggered at 15s and 40s)
    true_scr = np.zeros_like(t)
    # Spike at t=15
    idx_15 = int(15.0 * fs)
    true_scr[idx_15:] += 1.5 * np.exp(-0.1 * (t[idx_15:] - 15.0))
    # Spike at t=40
    idx_40 = int(40.0 * fs)
    true_scr[idx_40:] += 2.0 * np.exp(-0.15 * (t[idx_40:] - 40.0))
    
    # Add tiny high-frequency sensor noise
    noise = np.random.normal(0, 0.05, len(t))
    raw_signal = true_scl + true_scr + noise
    
    # Run decomposition
    est_scl, est_scr = separate_gsr_components(raw_signal, fs_hz=fs)
    
    # Assertions
    # Tonic component SCL should be close to true_scl (mean difference < 0.5 uS)
    assert np.mean(np.abs(est_scl - true_scl)) < 0.5
    
    # Phasic component SCR should have clear peaks near t=15 and t=40
    assert est_scr[idx_15 + int(1*fs)] > 0.5  # active spike
    assert est_scr[int(5.0*fs)] < 0.1         # no spike early on

def test_detect_ppg_peaks():
    """Verify that peaks are detected correctly in a noisy PPG wave."""
    fs = 50.0  # 50Hz sampling rate
    duration = 10.0
    t = np.linspace(0, duration, int(fs * duration), endpoint=False)
    
    # Heart rate of 75 BPM = 1.25 Hz. Peak should occur every 0.8 seconds (40 samples)
    freq = 1.25
    clean_ppg = np.sin(2 * np.pi * freq * t) + 0.3 * np.sin(4 * np.pi * freq * t - 1.0)
    
    # Add noise
    noise = np.random.normal(0, 0.1, len(t))
    noisy_ppg = clean_ppg + noise
    
    # Run detector
    peaks = detect_ppg_peaks(noisy_ppg, fs_hz=fs)
    
    # In 10 seconds at 75 BPM, we expect around 12 to 13 beats
    assert len(peaks) >= 11
    assert len(peaks) <= 14
    
    # Verify refractory period is respected (no two peaks should be closer than 17 samples at 50Hz)
    diffs = np.diff(peaks)
    assert np.all(diffs >= 17)

def test_calculate_ibis_and_hrv_features():
    """Verify that peak intervals translate into correct HRV features."""
    fs = 50.0  # 50Hz
    # Create peak indices separated by exactly 800ms (40 samples) and 820ms (41 samples)
    # This corresponds to 75 BPM and 73 BPM
    peaks = np.array([50, 90, 131, 171, 212, 252])
    
    # Calculate IBIs
    ibis = calculate_ibis_from_peaks(peaks, fs_hz=fs)
    
    # 5 peaks -> 4 intervals: 40, 41, 40, 41, 40 samples -> 800ms, 820ms, 800ms, 820ms, 800ms
    assert len(ibis) == 5
    assert np.allclose(ibis, [800.0, 820.0, 800.0, 820.0, 800.0])
    
    # Test HRV extraction
    hrv = extract_hrv_features(ibis)
    assert hrv["hr_mean"] == pytest.approx(74.0, abs=2.0)
    assert hrv["hrv_sdnn"] == pytest.approx(10.0, abs=1.0) # low variability
    assert hrv["hrv_rmssd"] == pytest.approx(20.0, abs=1.0) # RMSSD calculation verification
