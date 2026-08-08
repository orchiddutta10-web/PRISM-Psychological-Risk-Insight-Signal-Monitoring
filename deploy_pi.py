import os
import tarfile
import paramiko
from pathlib import Path
import stat

IP = "192.168.1.155"
USER = "pi4b"
PASS = "plmnkoijb#38"
REMOTE_DIR = "/home/pi4b/prism_edge"
LOCAL_DIR = Path("C:/Users/Jyotishmoy Gogoi/prism/prism_edge")


def create_tar():
    tar_path = "prism_edge.tar.gz"
    print("Creating archive...")
    with tarfile.open(tar_path, "w:gz") as tar:
        # Avoid packing pycache and venv if any exist inside prism_edge
        def filter_func(tarinfo):
            if "__pycache__" in tarinfo.name or ".venv" in tarinfo.name:
                return None
            return tarinfo

        tar.add(LOCAL_DIR, arcname="prism_edge", filter=filter_func)
    return tar_path


def deploy():
    tar_path = create_tar()

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"Connecting to {USER}@{IP}...")
    try:
        ssh.connect(IP, username=USER, password=PASS, timeout=10)
    except Exception as e:
        print(f"Failed to connect: {e}")
        return

    sftp = ssh.open_sftp()

    print("Uploading archive...")
    sftp.put(tar_path, f"/home/{USER}/prism_edge.tar.gz")

    print("Extracting on Raspberry Pi...")
    # Clean old dir and extract
    ssh.exec_command(f"rm -rf {REMOTE_DIR} && tar -xzf prism_edge.tar.gz")

    # We will just run the script using the Pi's system python or a venv.
    # To keep it simple, we'll try to run it immediately using a shell command,
    # and print the output.

    print(
        "Installing dependencies and running main.py on the Pi (this might take a minute)..."
    )

    jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxYjRjZTVhMS03Y2Q5LTRlZjMtODc4My1hNGU3YTY0ZjZjNjMiLCJ0eXBlIjoiZGV2aWNlIiwiZXhwIjoxNzg1MDk5Mjg4fQ.JPXE9z6EmKaDDe2mTWHqOGhCZWNnC1Y9e2UNkKJ5Xyo"
    uuid = "1b4ce5a1-7cd9-4ef3-8783-a4e7a64f6c63"
    api_ip = "192.168.1.X"  # The API server is on the Windows machine. We need to tell the Pi how to reach it!
    # Wait, 192.168.1.something is the Windows machine IP.

    # Let's just install requirements for now and start the edge node headless.
    setup_cmd = f"""
    cd {REMOTE_DIR}
    python3 -m venv .venv
    source .venv/bin/activate
    pip install -r requirements.txt
    export PYTHONPATH="."
    export PRISM_DEVICE_JWT="{jwt}"
    export PRISM_DEVICE_ID="{uuid}"
    export PRISM_API_BASE_URL="http://127.0.0.1:8000" # NOTE: We will fix this in a moment
    nohup python3 prism_edge/main.py > edge_node.log 2>&1 &
    """

    stdin, stdout, stderr = ssh.exec_command(setup_cmd)

    exit_status = stdout.channel.recv_exit_status()  # Blocking call

    print(f"Deployment script exited with status: {exit_status}")

    # Read the log file to see if it crashed or started successfully
    stdin, stdout, stderr = ssh.exec_command(f"cat {REMOTE_DIR}/edge_node.log")
    print("==== PI LOGS ====")
    print(stdout.read().decode())

    sftp.close()
    ssh.close()
    os.remove(tar_path)
    print("Done!")


if __name__ == "__main__":
    deploy()
