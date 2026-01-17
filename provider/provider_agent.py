import subprocess
import sys
import time
import re
import uuid
import requests
import threading
import os

JUPYTER_PORT = 8888
SERVER_URL = "https://runit-p5ah.onrender.com"
PROVIDER_ID = str(uuid.uuid4())

# Track actual container activity
LAST_CONTAINER_ACTIVITY = {"time": time.time(), "prev_net_io": None}
IDLE_TIMEOUT = 10 * 60  # 10 minutes
SHUTDOWN = False  # Flag to stop heartbeat when container stops

def ensure_docker_image():
    image_name = "runit-jupyter"

    print("[agent] checking docker image:", image_name)

    result = subprocess.run(
        ["docker", "images", "-q", image_name],
        capture_output=True,
        text=True
    )

    if result.returncode != 0:
        raise RuntimeError("Docker not available")

    if result.stdout.strip():
        print("[agent] docker image exists")
        return

    print("[agent] docker image not found, building...")

    build = subprocess.Popen(
        ["docker", "build", "-t", image_name, "."],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True
    )

    for line in build.stdout:
        print("[docker-build]", line.strip())

    if build.wait() != 0:
        raise RuntimeError("Docker image build failed")

    print("[agent] docker image built successfully")

def start_docker_jupyter():
    print("[agent] starting dockerized jupyter...")

    # 🔒 Ensure workspace exists with absolute path
    workspace_path = os.path.abspath(os.path.join(os.getcwd(), "workspace"))
    os.makedirs(workspace_path, exist_ok=True)
    
    # Create welcome file if workspace is empty
    welcome_file = os.path.join(workspace_path, "README.md")
    if not os.path.exists(welcome_file):
        with open(welcome_file, "w") as f:
            f.write("# Welcome to RUNIT\n\n")
            f.write("This is your persistent workspace.\n\n")
            f.write("Files saved here will persist across container restarts.\n")
    
    print(f"[agent] workspace ready: {workspace_path}")

    cmd = [
        "docker", "run",
        "--rm",
        "-p", "8888:8888",
        "--name", "runit-session",
        # 🔒 Security: Resource limits
        "--memory", "4g",              # Max 4GB RAM
        "--cpus", "2.0",               # Max 2 CPU cores
        "--pids-limit", "100",         # Limit number of processes
        # 🔒 Security: Network (use default bridge; no custom alias required)
        # 🔒 Security: No privileged mode
        "--security-opt", "no-new-privileges:true",
        # 🔒 Security: Read-only root filesystem (workspace is writable)
        "--read-only",
        "--tmpfs", "/tmp:rw,noexec,nosuid,size=100m",
        "--tmpfs", "/home/jupyteruser/.local:rw,noexec,nosuid,size=200m",
        "-v", f"{workspace_path}:/workspace:rw",
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

        if "Error response from daemon" in line:
            raise RuntimeError("Docker container failed to start")

        if "token=" in line and token is None:
            m = re.search(r"token=([a-z0-9]+)", line)
            if m:
                token = m.group(1)
                print("[agent] token detected:", token)
                break

    if not token:
        raise RuntimeError("Jupyter token not found; aborting")

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


def heartbeat_loop(session_id, payload):
    """Send heartbeats to server. If 404, server restarted - re-register needed."""
    global SHUTDOWN
    
    while not SHUTDOWN:  # ✅ Exit loop when shutdown flag is set
        try:
            resp = requests.post(
                f"{SERVER_URL}/provider/heartbeat",
                json={"sessionId": session_id},
                timeout=5
            )
            
            if resp.status_code == 404:
                print("[agent] server returned 404 - attempting to re-register...")
                try:
                    resp = requests.post(
                        f"{SERVER_URL}/provider/session",
                        json=payload,
                        timeout=5
                    )
                    resp.raise_for_status()
                    data = resp.json()
                    new_session_id = data["sessionId"]
                    print("[agent] re-registered with new session ID:", new_session_id)
                    session_id = new_session_id
                except Exception as e:
                    print("[agent] re-registration failed:", e)
            elif resp.status_code != 200:
                print("[agent] heartbeat returned:", resp.status_code)
                
        except Exception as e:
            print("[agent] heartbeat error:", e)
        
        time.sleep(30)
    
    print("[agent] heartbeat loop stopped")


def check_container_activity():
    """Check if container has network activity (actual usage)."""
    global LAST_CONTAINER_ACTIVITY
    
    try:
        result = subprocess.run(
            ["docker", "stats", "runit-session", "--no-stream", "--format", "{{.NetIO}}"],
            capture_output=True,
            text=True,
            timeout=5
        )
        
        if result.returncode == 0 and result.stdout.strip():
            net_io = result.stdout.strip()
            
            # Compare with previous reading
            if LAST_CONTAINER_ACTIVITY["prev_net_io"] != net_io:
                LAST_CONTAINER_ACTIVITY["time"] = time.time()
                LAST_CONTAINER_ACTIVITY["prev_net_io"] = net_io
                return True
            
    except Exception:
        pass
    
    return False


def idle_monitor(container_proc, session_id):
    """Monitor idle timeout with actual container activity detection."""
    global LAST_CONTAINER_ACTIVITY, SHUTDOWN
    
    while True:
        # Check if container is still running
        if container_proc.poll() is not None:
            print("[agent] container has stopped, stopping heartbeat")
            SHUTDOWN = True  # ✅ Signal heartbeat_loop to stop
            break

        # Check if session is locked (in use by a renter)
        session_locked = False
        try:
            res = requests.get(
                f"{SERVER_URL}/provider/session/{session_id}",
                timeout=5
            )
            if res.ok:
                status = res.json()["status"]
                if status == "LOCKED":
                    session_locked = True
                    # Check for actual container activity
                    if check_container_activity():
                        print("[agent] container activity detected")
                    time.sleep(30)
                    continue
        except Exception:
            pass

        # If session is READY (not locked), check idle timeout
        if not session_locked:
            idle_time = time.time() - LAST_CONTAINER_ACTIVITY["time"]
            if idle_time > IDLE_TIMEOUT:
                print(f"[agent] idle timeout reached ({idle_time:.0f}s), stopping container")
                container_proc.terminate()
                break
        
        time.sleep(30)

def detect_hardware():
    gpu = "CPU"
    vram_gb = 0

    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader"],
            capture_output=True,
            text=True
        )

        if result.returncode == 0 and result.stdout.strip():
            line = result.stdout.strip().split("\n")[0]
            name, mem = line.split(",")
            gpu = name.strip()
            vram_gb = int(mem.strip().split()[0]) // 1024
    except Exception:
        pass

    # macOS / Apple Silicon (best-effort)
    if gpu == "CPU" and sys.platform == "darwin":
        gpu = "Apple Silicon"
        vram_gb = 0  # unified memory

    ram_gb = int(
        subprocess.run(
            ["sysctl", "-n", "hw.memsize"],
            capture_output=True,
            text=True
        ).stdout.strip()
    ) // (1024**3)

    return {
        "gpu": gpu,
        "vram_gb": vram_gb,
        "ram_gb": ram_gb
    }

def estimate_price(hardware):
    gpu = hardware["gpu"]

    if "A100" in gpu:
        return 3.00
    if "4090" in gpu:
        return 1.80
    if "Apple" in gpu:
        return 0.50

    return 0.20  # CPU default


def main():
    global LAST_ACTIVITY

    # 🔒 Ensure workspace directory exists with proper permissions
    workspace_dir = os.path.join(os.getcwd(), "workspace")
    
    # Clean up any stale Docker volumes if workspace was deleted
    if not os.path.exists(workspace_dir):
        print(f"[agent] workspace missing, cleaning up stale containers...")
        subprocess.run(["docker", "stop", "runit-session"], capture_output=True)
        subprocess.run(["docker", "rm", "runit-session"], capture_output=True)
    
    os.makedirs(workspace_dir, exist_ok=True)
    
    # Create a welcome file so Jupyter has something to show
    welcome_file = os.path.join(workspace_dir, "README.md")
    if not os.path.exists(welcome_file):
        with open(welcome_file, "w") as f:
            f.write("# Welcome to RUNIT\n\n")
            f.write("This is your persistent workspace.\n\n")
            f.write("Files saved here will remain even when the container restarts.\n")
    
    print(f"[agent] workspace directory: {workspace_dir}")

    try:
        ensure_docker_image()
        docker_proc, token = start_docker_jupyter()
    except Exception as e:
        print("[agent] startup failed:", e)
        return

    time.sleep(2)

    cloudflared_proc, public_url = start_cloudflared()

    print("\n=== SESSION READY ===")
    print("URL  :", public_url)
    print("TOKEN:", token)
    print("====================\n")
    
    hardware = detect_hardware()
    price_per_hour = estimate_price(hardware)
    
    payload = {
    "providerId": PROVIDER_ID,
    "publicUrl": public_url,
    "token": token,
    "hardware": hardware,
    "pricing": {
        "hourlyUsd": price_per_hour
    }
}

    # 🔁 retry registration until success
    while True:
        try:
            resp = requests.post(
                f"{SERVER_URL}/provider/session",
                json=payload,
                timeout=5
            )
            resp.raise_for_status()
            break
        except Exception as e:
            print("[agent] registration failed, retrying in 5s...", e)
            time.sleep(5)

    data = resp.json()
    SESSION_ID = data["sessionId"]
    ACCESS_TOKEN = data["accessToken"]

    print("[agent] session registered:", SESSION_ID)
    print("[agent] access token issued (stored server-side)")

    # ❤️ heartbeat (with auto re-registration if needed)
    threading.Thread(
        target=heartbeat_loop,
        args=(SESSION_ID, payload),
        daemon=True
    ).start()

    # 💤 idle monitor (session-aware - won't kill if LOCKED)
    threading.Thread(
        target=idle_monitor,
        args=(docker_proc, SESSION_ID),
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
