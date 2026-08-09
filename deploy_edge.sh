#!/usr/bin/env bash
# PRISM Edge Node - Production Deployment Script
# Designed for Raspberry Pi OS (Bookworm)

set -e

echo "========================================"
echo " Starting PRISM Edge Node Deployment"
echo "========================================"

# 1. Update package list and install system dependencies
echo "[1/5] Installing system dependencies..."
sudo apt-get update
sudo apt-get install -y libportaudio2 portaudio19-dev libsndfile1 python3-venv python3-pip sqlite3

# 2. Setup Python Virtual Environment
echo "[2/5] Setting up Virtual Environment..."
cd /home/pi4b/iot-project/PRISM-Psychological-Risk-Insight-Signal-Monitoring
python3 -m venv .venv
source .venv/bin/activate

# 3. Install Python requirements
echo "[3/5] Installing Python packages..."
pip install --upgrade pip
pip install -r prism_edge/requirements.txt

# 4. Initialize Database Directory
echo "[4/5] Initializing Database..."
# The application automatically runs automigrations in edge_gateway.db upon start

# 5. Setup Systemd Service for Persistence
echo "[5/5] Configuring systemd service..."
sudo tee /etc/systemd/system/prism-edge.service > /dev/null <<EOF
[Unit]
Description=PRISM Edge Behaviour Node
After=network.target

[Service]
Type=simple
User=pi4b
WorkingDirectory=/home/pi4b/iot-project/PRISM-Psychological-Risk-Insight-Signal-Monitoring
Environment="PATH=/home/pi4b/iot-project/PRISM-Psychological-Risk-Insight-Signal-Monitoring/.venv/bin"
Environment="PYTHONPATH=/home/pi4b/iot-project/PRISM-Psychological-Risk-Insight-Signal-Monitoring"
ExecStart=/home/pi4b/iot-project/PRISM-Psychological-Risk-Insight-Signal-Monitoring/.venv/bin/python3 -m prism_edge.main
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable prism-edge.service
# Note: we are not automatically starting it here so the user can review config first.

echo "========================================"
echo " Deployment Configured Successfully!"
echo "----------------------------------------"
echo "To start the node, run:"
echo "  sudo systemctl start prism-edge.service"
echo "To view live logs, run:"
echo "  sudo journalctl -u prism-edge.service -f"
echo "========================================"
