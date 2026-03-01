#!/usr/bin/env python3
from __future__ import annotations

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")


def main() -> None:
    from waitress import serve
    from config.wsgi import application

    host = os.environ.get("MP_CRM_HOST", "127.0.0.1")
    port = int(os.environ.get("MP_CRM_PORT", "2210"))
    browser_host = "127.0.0.1" if host in {"0.0.0.0", "::"} else host
    url = f"http://{browser_host}:{port}"
    print(f"[MP_CRM] Starting on {url}")
    print(f"[MP_CRM] Open in browser: {url}")
    serve(application, host=host, port=port, threads=8)


if __name__ == "__main__":
    main()
