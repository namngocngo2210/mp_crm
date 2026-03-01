#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_DIR="$ROOT_DIR/backend"
RELEASE_DIR="$ROOT_DIR/releases"
LINUX_RELEASE_DIR="$RELEASE_DIR/linux"
WINDOWS_RELEASE_DIR="$RELEASE_DIR/windows"

echo "[1/6] Build frontend"
pushd "$FRONTEND_DIR" >/dev/null
if [[ ! -d node_modules ]]; then
  npm install
fi
npm run build
popd >/dev/null

echo "[2/6] Check build tools"
if ! command -v pyinstaller >/dev/null 2>&1; then
  echo "[ERROR] pyinstaller is not installed."
  echo "Install once, then rerun:"
  echo "  python3 -m pip install pyinstaller"
  exit 1
fi
python3 - <<'PY'
import importlib.util, sys
missing = [pkg for pkg in ("django", "sqlalchemy", "corsheaders", "waitress") if importlib.util.find_spec(pkg) is None]
if missing:
    print("[ERROR] Missing Python packages:", ", ".join(missing))
    print("Install once, then rerun:")
    print("  python3 -m pip install -r backend/requirements.txt")
    sys.exit(1)
print("[OK] Python deps ready")
PY

echo "[3/6] Build Linux executable"
rm -rf "$BACKEND_DIR/build" "$BACKEND_DIR/dist" "$LINUX_RELEASE_DIR"
mkdir -p "$LINUX_RELEASE_DIR/data" "$LINUX_RELEASE_DIR/media"
pushd "$BACKEND_DIR" >/dev/null
pyinstaller \
  --noconfirm \
  --clean \
  --onefile \
  --name MP_CRM \
  --paths "$BACKEND_DIR" \
  --add-data "$FRONTEND_DIR/dist:web" \
  launcher.py
popd >/dev/null

cp "$BACKEND_DIR/dist/MP_CRM" "$LINUX_RELEASE_DIR/MP_CRM"
chmod +x "$LINUX_RELEASE_DIR/MP_CRM"
if [[ -f "$BACKEND_DIR/data/app.db" ]]; then
  cp "$BACKEND_DIR/data/app.db" "$LINUX_RELEASE_DIR/data/app.db"
else
  : > "$LINUX_RELEASE_DIR/data/app.db"
fi
if [[ -d "$BACKEND_DIR/media" ]]; then
  cp -R "$BACKEND_DIR/media/." "$LINUX_RELEASE_DIR/media/" || true
fi

echo "[4/6] Prepare Windows build (Docker)"
rm -rf "$WINDOWS_RELEASE_DIR"
mkdir -p "$WINDOWS_RELEASE_DIR/data" "$WINDOWS_RELEASE_DIR/media"
if command -v docker >/dev/null 2>&1; then
  WIN_DOCKER_IMAGE="${MP_WIN_DOCKER_IMAGE:-cdrx/pyinstaller-windows:python3}"
  WIN_BUILD_LOG="$RELEASE_DIR/windows_build.log"
  set +e
  docker run --rm \
    --entrypoint /bin/bash \
    -v "$ROOT_DIR:/src" \
    -w /src/backend \
    "$WIN_DOCKER_IMAGE" \
    -lc "python -m pip install -r requirements.txt pyinstaller && pyinstaller --noconfirm --clean --onefile --name MP_CRM --paths /src/backend --add-data '/src/frontend/dist;web' launcher.py" \
    2>&1 | tee "$WIN_BUILD_LOG"
  DOCKER_RC=$?
  set -e
  if [[ $DOCKER_RC -eq 0 && -f "$BACKEND_DIR/dist/windows/MP_CRM.exe" ]]; then
    cp "$BACKEND_DIR/dist/windows/MP_CRM.exe" "$WINDOWS_RELEASE_DIR/MP_CRM.exe"
  elif [[ $DOCKER_RC -eq 0 && -f "$BACKEND_DIR/dist/MP_CRM.exe" ]]; then
    cp "$BACKEND_DIR/dist/MP_CRM.exe" "$WINDOWS_RELEASE_DIR/MP_CRM.exe"
  else
    echo "[WARN] Docker Windows build failed. See log: $WIN_BUILD_LOG"
    echo "[INFO] Current Docker image: $WIN_DOCKER_IMAGE"
    echo "[INFO] If log shows Python/Django version mismatch, build Windows exe via GitHub Actions workflow:"
    echo "       .github/workflows/build-windows-exe.yml"
    if [[ -f "$WIN_BUILD_LOG" ]]; then
      echo "----- windows_build.log (tail) -----"
      tail -n 80 "$WIN_BUILD_LOG" || true
      echo "------------------------------------"
    fi
  fi
else
  echo "[WARN] Docker not found. Skipped Windows exe build."
fi

if [[ -f "$BACKEND_DIR/data/app.db" ]]; then
  cp "$BACKEND_DIR/data/app.db" "$WINDOWS_RELEASE_DIR/data/app.db"
else
  : > "$WINDOWS_RELEASE_DIR/data/app.db"
fi
if [[ -d "$BACKEND_DIR/media" ]]; then
  cp -R "$BACKEND_DIR/media/." "$WINDOWS_RELEASE_DIR/media/" || true
fi

echo "[5/6] Write run notes"
cat > "$RELEASE_DIR/README.txt" <<'TXT'
Linux:
- cd releases/linux
- ./MP_CRM

Windows:
- cd releases/windows
- run MP_CRM.exe

Data persistence:
- DB file is external at data/app.db
- Keep this file when replacing executable
TXT

echo "[6/6] Done"
echo "Linux output:   $LINUX_RELEASE_DIR/MP_CRM"
echo "Windows output: $WINDOWS_RELEASE_DIR/MP_CRM.exe (if build succeeded)"
