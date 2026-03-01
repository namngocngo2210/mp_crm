#!/usr/bin/env python3
from __future__ import annotations

import os
import socket
import subprocess
import sys
import threading
import time
import webbrowser

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")


def _is_port_bindable(host: str, port: int) -> bool:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind((host, port))
        return True
    except OSError:
        return False
    finally:
        sock.close()


def _pick_port(host: str, preferred: int) -> int:
    # Try preferred port first, then a small fallback range.
    candidates = [preferred] + [p for p in range(8001, 8021) if p != preferred]
    for port in candidates:
        if _is_port_bindable(host, port):
            return port
    # Fallback to ephemeral port choice by OS.
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        sock.bind((host, 0))
        return int(sock.getsockname()[1])
    finally:
        sock.close()


def _wait_until_listening(host: str, port: int, timeout_seconds: float = 12.0) -> bool:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(0.4)
        try:
            sock.connect((host, port))
            return True
        except OSError:
            time.sleep(0.15)
        finally:
            sock.close()
    return False


def _open_browser_best_effort(url: str) -> bool:
    try:
        if webbrowser.open(url):
            return True
    except Exception:
        pass

    if sys.platform.startswith("win"):
        try:
            os.startfile(url)  # type: ignore[attr-defined]
            return True
        except Exception:
            pass
        try:
            subprocess.Popen(["cmd", "/c", "start", "", url], shell=False)
            return True
        except Exception:
            pass
    return False


def main() -> None:
    from waitress import serve
    from config.wsgi import application

    host = os.environ.get("MP_CRM_HOST", "127.0.0.1")
    preferred_port = int(os.environ.get("MP_CRM_PORT", "8000"))
    port = _pick_port(host, preferred_port)
    browser_host = "127.0.0.1" if host in {"0.0.0.0", "::"} else host
    url = f"http://{browser_host}:{port}"
    if port != preferred_port:
        print(f"[MP_CRM] Port {preferred_port} unavailable, using {port}")
    else:
        print(f"[MP_CRM] Starting on {url}")

    def open_browser() -> None:
        ready = _wait_until_listening(browser_host, port, timeout_seconds=15.0)
        if not ready:
            print(f"[MP_CRM] Server not ready for browser auto-open: {url}")
            return
        for _ in range(5):
            if _open_browser_best_effort(url):
                print(f"[MP_CRM] Browser opened: {url}")
                return
            time.sleep(0.4)
        print(f"[MP_CRM] Could not auto-open browser. Please open manually: {url}")

    threading.Thread(target=open_browser, daemon=True).start()
    serve(application, host=host, port=port, threads=8)


if __name__ == "__main__":
    main()
