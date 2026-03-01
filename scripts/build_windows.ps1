Param(
  [string]$PythonExe = "python"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$frontend = Join-Path $root "frontend"
$backend = Join-Path $root "backend"
$release = Join-Path $root "releases\windows"

Write-Host "[1/5] Build frontend"
Push-Location $frontend
npm ci
npm run build
Pop-Location

Write-Host "[2/5] Install backend deps"
Push-Location $backend
& $PythonExe -m pip install --upgrade pip
& $PythonExe -m pip install -r requirements.txt
& $PythonExe -m pip install pyinstaller

Write-Host "[3/5] Build exe"
pyinstaller --noconfirm --clean --onefile --name MP_CRM --paths . --add-data "..\frontend\dist;web" launcher.py
Pop-Location

Write-Host "[4/5] Prepare release"
New-Item -ItemType Directory -Path "$release\data" -Force | Out-Null
New-Item -ItemType Directory -Path "$release\media" -Force | Out-Null
Copy-Item "$backend\dist\MP_CRM.exe" "$release\MP_CRM.exe" -Force
if (Test-Path "$backend\data\app.db") {
  Copy-Item "$backend\data\app.db" "$release\data\app.db" -Force
}
if (Test-Path "$backend\media") {
  Copy-Item "$backend\media\*" "$release\media" -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "[5/5] Done"
Write-Host "Output: $release\MP_CRM.exe"
