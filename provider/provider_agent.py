import subprocess
import sys
import time
import re
import uuid
import requests
import threading

JUPYTER_PORT = 8888
SERVER_URL = "https://runit-p5ah.onrender.com"
PROVIDER_ID = str(uuid.uuid4())

LAST_ACTIVITY = time.time()
IDLE_TIMEOUT = 10 * 60  # 10 minutes


def start_docker_jupyter():
    print("[agent] starting dockerized jupyter...")

    cmd = [
        "docker", "run",
        "--rm",
        "-p", "8888:8888",
        "--name", "runit-session",
        "runit-jupyter"
    ]

    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True
    )

    token = None
    for line in proc.stdout:
        print("[docker]", line.strip())
        if "token=" in line and token is None:
            m = re.search(r"token=([a-z0-9]+)", line)
            if m:
                token = m.group(1)
                print("[agent] token detected:", token)
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


def idle_monitor(container_proc):
    global LAST_ACTIVITY

    while True:
        if time.time() - LAST_ACTIVITY > IDLE_TIMEOUT:
            print("[agent] idle timeout reached, stopping container")
            container_proc.terminate()
            break
        time.sleep(30)


def main():
    global LAST_ACTIVITY

    docker_proc, token = start_docker_jupyter()
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

    if not resp.ok:
        print("[agent] session registration FAILED")
        print(resp.text)
        return

    session_id = resp.json()["sessionId"]
    print("[agent] session registered:", session_id)

    threading.Thread(
        target=heartbeat_loop,
        args=(session_id,),
        daemon=True
    ).start()

    threading.Thread(
        target=idle_monitor,
        args=(docker_proc,),
        daemon=True
    ).start()

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n[agent] shutting down")
        docker_proc.terminate()
        cloudflared_proc.terminate()


if __name__ == "__main__":
    main()
