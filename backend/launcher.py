#!/usr/bin/env python3
from __future__ import annotations

import os
import threading
import time
import webbrowser

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")


def main() -> None:
    from waitress import serve
    from config.wsgi import application

    host = os.environ.get("MP_CRM_HOST", "127.0.0.1")
    port = int(os.environ.get("MP_CRM_PORT", "8000"))
    url = f"http://{host}:{port}"

    def open_browser() -> None:
        time.sleep(1.2)
        try:
            webbrowser.open(url)
        except Exception:
            pass

    threading.Thread(target=open_browser, daemon=True).start()
    serve(application, host=host, port=port, threads=8)


if __name__ == "__main__":
    main()
