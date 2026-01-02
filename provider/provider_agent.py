import subprocess
import sys
import time
import re
import uuid
import requests

JUPYTER_PORT = 8888
SERVER_URL = "https://runit-p5ah.onrender.com"  # change this
PROVIDER_ID = str(uuid.uuid4())
session_id = resp.json()["sessionId"]
CURRENT_SESSION_ID = session_id

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
        m = re.search(r"https://.*\.trycloudflare\.com", line)
        if m:
            public_url = m.group(0)
            print("[agent] detected public URL:", public_url)
            break

    return proc, public_url

def heartbeat_loop(session_id):
    while True:
        try:
            requests.post(
                f"{SERVER_URL}/provider/heartbeat",
                json={"sessionId": session_id},
                timeout=5
            )
        except Exception:
            pass
        time.sleep(30)

import threading
threading.Thread(
    target=heartbeat_loop,
    args=(CURRENT_SESSION_ID,),
    daemon=True
).start()

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

    # resp = requests.post(f"{SERVER_URL}/provider/session", json=payload)
    # print("[agent] registered session:", resp.json())
    resp = requests.post(f"{SERVER_URL}/provider/session", json=payload)

    print("[agent] server status code:", resp.status_code)
    print("[agent] server raw response:", resp.text)

    if resp.ok:
        print("[agent] session registered successfully")
    else:
        print("[agent] session registration FAILED")

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n[agent] shutting down")
        jupyter_proc.terminate()
        cloudflared_proc.terminate()


if __name__ == "__main__":
    main()
