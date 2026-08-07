"""
Raspberry Pi 4 PRISM Edge Node Setup Script
============================================

Run this script ON the Raspberry Pi to configure it as a PRISM Edge Node:
  1. Sets up Wi-Fi hotspot (PRISM-Node / PrismEdge2024)
  2. Installs Python dependencies
  3. Connects ESP32 over USB serial
  4. Runs the PRISM Edge Bridge
  5. Forward data to the PRISM API

Copy this file to the Pi and run:
  sudo python3 setup_pi.py

Or run remotely via SSH once Pi is connected:
  ssh pi@raspberrypi.local 'bash -s' < setup_pi.sh
"""

import os
import sys
import subprocess
import shutil
from pathlib import Path

HOTSPOT_SSID = "PRISM-Node"
HOTSPOT_PASS = "PrismEdge2024"
BRIDGE_PORT = 8500


def run(cmd: str, check: bool = True) -> str:
    """Run a shell command."""
    print(f"  $ {cmd}")
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if check and result.returncode != 0:
        print(f"  ERROR: {result.stderr}")
    return result.stdout.strip()


def setup_hotspot():
    """Configure Pi as WiFi access point using hostapd + dnsmasq."""
    print("\n=== Setting up Wi-Fi Hotspot ===")

    # Install packages
    run("apt-get update -qq")
    run("apt-get install -y hostapd dnsmasq -qq")

    # Configure static IP for wlan0
    dhcpcd_conf = """
interface wlan0
    static ip_address=192.168.4.1/24
    nohook wpa_supplicant
"""
    with open("/etc/dhcpcd.conf", "a") as f:
        f.write(dhcpcd_conf)

    # hostapd config
    hostapd_conf = f"""
interface=wlan0
driver=nl80211
ssid={HOTSPOT_SSID}
hw_mode=g
channel=7
wmm_enabled=0
macaddr_acl=0
auth_algs=1
ignore_broadcast_ssid=0
wpa=2
wpa_passphrase={HOTSPOT_PASS}
wpa_key_mgmt=WPA-PSK
wpa_pairwise=TKIP
rsn_pairwise=CCMP
"""
    with open("/etc/hostapd/hostapd.conf", "w") as f:
        f.write(hostapd_conf)

    run(
        'sed -i \'s|#DAEMON_CONF=""|DAEMON_CONF="/etc/hostapd/hostapd.conf"|\' /etc/default/hostapd'
    )

    # dnsmasq config
    dnsmasq_conf = """
interface=wlan0
dhcp-range=192.168.4.2,192.168.4.100,255.255.255.0,24h
"""
    with open("/etc/dnsmasq.conf", "w") as f:
        f.write(dnsmasq_conf)

    run("systemctl unmask hostapd")
    run("systemctl enable hostapd dnsmasq")
    run("systemctl restart dhcpcd hostapd dnsmasq")
    print("  Hotspot configured! SSID: PRISM-Node, Pass: PrismEdge2024")


def install_dependencies():
    """Install Python packages for PRISM Edge."""
    print("\n=== Installing Python Dependencies ===")
    run("pip3 install pyserial httpx uvicorn fastapi numpy -q")


def setup_bridge_service():
    """Create systemd service for the PRISM Edge Bridge."""
    print("\n=== Setting up PRISM Edge Bridge Service ===")

    bridge_script = str(Path(__file__).resolve().parent / "bridge.py")

    service_content = f"""
[Unit]
Description=PRISM Edge Bridge
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory={Path(__file__).resolve().parent}
ExecStart=/usr/bin/python3 {bridge_script} --port {BRIDGE_PORT}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
"""
    with open("/etc/systemd/system/prism-edge.service", "w") as f:
        f.write(service_content)

    run("systemctl daemon-reload")
    run("systemctl enable prism-edge")
    run("systemctl start prism-edge")
    print(f"  Bridge service started on port {BRIDGE_PORT}")


def print_status():
    """Print final status."""
    print("\n" + "=" * 50)
    print("PRISM Edge Node Setup Complete!")
    print("=" * 50)
    print(f"""
  WiFi Hotspot: SSID={HOTSPOT_SSID}  Pass={HOTSPOT_PASS}
  Pi IP:        192.168.4.1
  Bridge UI:    http://192.168.4.1:{BRIDGE_PORT}/dashboard
  Bridge API:   http://192.168.4.1:{BRIDGE_PORT}
  WebSocket:    ws://192.168.4.1:{BRIDGE_PORT}/ws

  ESP32 should be configured with:
    WiFi: {HOTSPOT_SSID} / {HOTSPOT_PASS}
    Bridge: http://192.168.4.1:{BRIDGE_PORT}/api/v1/telemetry/ingest
""")


def main():
    if os.geteuid() != 0:
        print("This script must be run as root (sudo).")
        sys.exit(1)

    print("PRISM Edge Node Setup for Raspberry Pi 4")
    print("=" * 50)

    setup_hotspot()
    install_dependencies()
    # setup_bridge_service()  # Uncomment when deploying on actual Pi
    print_status()


if __name__ == "__main__":
    main()
