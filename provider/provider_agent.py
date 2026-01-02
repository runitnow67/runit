import subprocess
import sys
import time
import re
import uuid
import requests

JUPYTER_PORT = 8888
SERVER_URL = "https://runit-p5ah.onrender.com"  # change this
PROVIDER_ID = str(uuid.uuid4())


def start_jupyter():
    print("[agent] starting jupyter...")

    cmd = [
        sys.executable, "-m", "jupyter", "lab",
        "--no-browser",
        "--ip=0.0.0.0",
        f"--port={JUPYTER_PORT}",
        "--ServerApp.allow_remote_access=True"
    ]

    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True
    )

    token = None
    for line in proc.stdout:
        print("[jupyter]", line.strip())
        if "token=" in line and token is None:
            m = re.search(r"token=([a-z0-9]+)", line)
            if m:
                token = m.group(1)
                break

    return proc, token


def start_cloudflared():
    print("[agent] starting cloudflared...")

    cmd = [
        "cloudflared",
        "tunnel",
        "--url",
        f"http://localhost:{JUPYTER_PORT}"
    ]

    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True
    )

    public_url = None
    for line in proc.stdout:
        print("[cloudflared]", line.strip())
        m = re.search(r"https://[a-zA-Z0-9\\-]+\\.trycloudflare\\.com", line)
        if m:
            public_url = m.group(0)
            break

    return proc, public_url


def main():
    jupyter_proc, token = start_jupyter()
    time.sleep(2)

    cloudflared_proc, public_url = start_cloudflared()

    print("\n=== SESSION READY ===")
    print("URL  :", public_url)
    print("TOKEN:", token)
    print("====================\n")

    payload = {
        "providerId": PROVIDER_ID,
        "publicUrl": public_url,
        "token": token
    }

    resp = requests.post(f"{SERVER_URL}/provider/session", json=payload)
    print("[agent] registered session:", resp.json())

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n[agent] shutting down")
        jupyter_proc.terminate()
        cloudflared_proc.terminate()


if __name__ == "__main__":
    main()
