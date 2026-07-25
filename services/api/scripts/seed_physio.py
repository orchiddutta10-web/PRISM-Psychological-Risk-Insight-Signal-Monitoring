"""Seed synthetic PhysioReadings for PRISM Node dashboard demo."""
import time, math, random, requests, sys, logging
from datetime import datetime, timezone

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger()

API = "http://localhost:8000/api/v1"

def seed():
    # 1. Try login first, then register if needed
    token = None
    for email, pwd in [
        ("prism-node-dem@prism-demo.dev", "NodeDemo123!"),
    ]:
        r = requests.post(f"{API}/auth/login", json={"email": email, "password": pwd})
        if r.status_code == 200 and r.json().get("access_token"):
            token = r.json()["access_token"]
            log.info("Logged in as %s", email)
            break

    if not token:
        log.info("Registering new guardian")
        r = requests.post(f"{API}/auth/register", json={
            "email": "prism-node-dem@prism-demo.dev",
            "full_name": "Node Guardian",
            "password": "NodeDemo123!"
        })
        if r.status_code not in (200, 201) and "already registered" not in r.text.lower():
            log.error("Reg failed: %s %s", r.status_code, r.text)
            sys.exit(1)
        r = requests.post(f"{API}/auth/login",
            json={"email": "prism-node-dem@prism-demo.dev", "password": "NodeDemo123!"})
        if r.status_code != 200:
            log.error("Login failed: %s %s", r.status_code, r.text)
            sys.exit(1)
        token = r.json()["access_token"]
        log.info("Registered and logged in")

    headers = {"Authorization": f"Bearer {token}"}

    # 2. Register device
    dev_resp = requests.post(f"{API}/auth/device", json={
        "name": "PRISM Node Wearable", "platform": "android",
        "device_token": "mock-fcm-prism-node"
    }, headers=headers)
    if dev_resp.status_code not in (200, 201):
        log.error("Device reg failed: %s %s", dev_resp.status_code, dev_resp.text)
        sys.exit(1)
    data = dev_resp.json()
    device_id = data["device"]["id"]
    device_token = data["device_jwt_token"]
    log.info("Device: %s", device_id)
    dev_headers = {"Authorization": f"Bearer {device_token}"}

    # 3. Consent grants
    r = requests.post(f"{API}/consent/grants/{device_id}",
        json={"modality": "gsr", "is_granted": True}, headers=headers)
    log.info("Grants consent: %s", r.status_code)

    r = requests.post(f"{API}/consent", json={
        "signal_type": "gsr", "consent_copy_version": 1, "granted": True
    }, headers=dev_headers)
    log.info("Legacy consent: %s", r.status_code)

    # 4. Stream readings
    log.info("Streaming 120 readings over ~60s...")
    for i in range(120):
        t = i * 0.5
        tonic = 3.0 + math.sin(t * 0.05) * 0.5
        phasic = random.uniform(0.5, 2.0) if random.random() < 0.1 else 0
        gsr_val = max(0.1, tonic + phasic + random.gauss(0, 0.05))
        r1 = requests.post(f"{API}/physio/ingest", json={
            "sensor_type": "gsr", "value": round(gsr_val, 3),
            "variance": 0.02, "timestamp": datetime.now(timezone.utc).isoformat()
        }, headers=dev_headers)

        hr = 72.0 + math.sin(2 * math.pi * 0.2 * t) * 5.0 + random.gauss(0, 1.5)
        r2 = requests.post(f"{API}/physio/ingest", json={
            "sensor_type": "ppg", "value": round(max(40, hr), 1),
            "variance": 2.5, "timestamp": datetime.now(timezone.utc).isoformat()
        }, headers=dev_headers)

        if i % 20 == 0:
            log.info("[%s/120] GSR=%s (%s) HR=%s (%s)", i,
                     r1.status_code, r2.status_code, round(gsr_val, 2), round(hr, 0))
        time.sleep(0.5)

    # 5. Verify
    r_status = requests.get(f"{API}/physio/status/{device_id}", headers=headers)
    r_ppg = requests.get(f"{API}/physio/readings/{device_id}?sensor_type=ppg&limit=3", headers=headers)
    r_gsr = requests.get(f"{API}/physio/readings/{device_id}?sensor_type=gsr&limit=3", headers=headers)
    log.info("Status: %s", r_status.text)
    log.info("PPG: %s readings", len(r_ppg.json()))
    log.info("GSR: %s readings", len(r_gsr.json()))

    print(f"\n=== SEED COMPLETE ===")
    print(f'T  localStorage.setItem("prism_token", "{token}");')
    print(f'T  localStorage.setItem("prism_selected_device", "{device_id}");')
    return token, device_id

if __name__ == "__main__":
    seed()
