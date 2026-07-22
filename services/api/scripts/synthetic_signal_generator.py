import time
import requests
import random
import math
from datetime import datetime, timezone
import argparse

# Config
API_URL = "http://localhost:8000/api/v1/events/ingest/unified"

def generate_synthetic_gsr(t, base=3.0, noise=0.05):
    """Generate GSR (microSiemens) combining tonic baseline and phasic peaks."""
    # Tonic slowly drifts
    tonic = base + math.sin(t * 0.05) * 0.5 
    # Phasic peaks simulate emotional arousal events
    phasic = 0
    if random.random() < 0.1:  # 10% chance of a peak every tick
        phasic = random.uniform(0.5, 2.0)
    
    val = tonic + phasic + random.gauss(0, noise)
    return max(0.1, val)

def generate_synthetic_ppg(t, bpm=72.0):
    """Generate a mock PPG/Heart Rate pulse waveform signal."""
    # We output instantaneous mock 'pulse' or just the computed HR from the waveform
    freq = bpm / 60.0
    # A generic pulse shape
    pulse_wave = math.sin(2 * math.pi * freq * t) + 0.5 * math.sin(4 * math.pi * freq * t)
    # Plus noise
    return pulse_wave + random.gauss(0, 0.1)

def generate_synthetic_data(device_id, token):
    headers = {"Authorization": f"Bearer {token}"}
    t = 0.0
    
    while True:
        try:
            t += 1.0
            
            # 1. Send GSR
            gsr_val = generate_synthetic_gsr(t)
            gsr_payload = {
                "subject_id": device_id,
                "modality": "gsr",
                "value": {"gsr_microsiemens": gsr_val, "is_synthetic": True},
                "confidence": 0.95,
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
            res = requests.post(API_URL, json=gsr_payload, headers=headers)
            print(f"[GSR] Sent {gsr_val:.2f} µS - Status: {res.status_code}")

            # 2. Send PPG (Waveform / HR)
            # Outputting a mock instantaneous BPM reading for simplicity downstream,
            # but using the PPG wave math conceptually to vary it.
            hr_val = 72.0 + generate_synthetic_ppg(t, 72.0) * 5.0
            ppg_payload = {
                "subject_id": device_id,
                "modality": "ppg",
                "value": {"heart_rate_bpm": max(40.0, hr_val), "is_synthetic": True},
                "confidence": 0.90,
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
            res = requests.post(API_URL, json=ppg_payload, headers=headers)
            print(f"[PPG] Sent {hr_val:.1f} BPM - Status: {res.status_code}")

            time.sleep(1.0)
            
        except Exception as e:
            print(f"Error sending data: {e}")
            time.sleep(5.0)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="PRISM Node Synthetic Physio Generator")
    parser.add_argument("--device_id", required=True, help="Child device UUID")
    parser.add_argument("--token", required=True, help="Device JWT token")
    args = parser.parse_args()
    
    print(f"Starting synthetic physio generation for device {args.device_id}...")
    generate_synthetic_data(args.device_id, args.token)
