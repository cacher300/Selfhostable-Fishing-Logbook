[CmdletBinding()]
param(
  [switch]$Reset
)

$projectRoot = Split-Path -Parent $PSScriptRoot
$pythonVersion = (Get-Content -LiteralPath (Join-Path $projectRoot ".python-version") -Raw).Trim()
$venvPath = Join-Path $projectRoot ".venv"
$pythonPath = Join-Path $venvPath "Scripts\python.exe"
# Local development installs the runtime plus test dependencies.
$requirementsPath = Join-Path $projectRoot "requirements-dev.txt"
$requirementsStampPath = Join-Path $venvPath ".requirements.sha256"

function New-VirtualEnvironment {
  $pythonLauncher = Get-Command py -ErrorAction SilentlyContinue
  if (-not $pythonLauncher) {
    throw "Python launcher 'py' was not found. Install Python $pythonVersion and run this script again."
  }

  & $pythonLauncher.Source "-$pythonVersion" -m venv $venvPath
  if ($LASTEXITCODE -ne 0) {
    throw "Could not create the project virtual environment."
  }
}

if ($Reset -and (Test-Path -LiteralPath $venvPath)) {
  Remove-Item -LiteralPath $venvPath -Recurse -Force
}

if (-not (Test-Path -LiteralPath $pythonPath)) {
  New-VirtualEnvironment
}

& $pythonPath -m pip --version 2>$null
if ($LASTEXITCODE -ne 0) {
  throw "The project virtual environment is not usable. Run .\scripts\run-local.ps1 -Reset."
}

$venvVersion = (& $pythonPath -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')").Trim()
if ($venvVersion -ne $pythonVersion) {
  throw "The project virtual environment uses Python $venvVersion, but this project requires $pythonVersion. Run .\scripts\run-local.ps1 -Reset."
}

$requirementsHash = ((Get-FileHash -LiteralPath $requirementsPath -Algorithm SHA256).Hash + (Get-FileHash -LiteralPath (Join-Path $projectRoot "requirements.txt") -Algorithm SHA256).Hash)
$installedRequirementsHash = if (Test-Path -LiteralPath $requirementsStampPath) {
  (Get-Content -LiteralPath $requirementsStampPath -Raw).Trim()
} else {
  ""
}

if ($requirementsHash -ne $installedRequirementsHash) {
  & $pythonPath -m pip install --disable-pip-version-check -r $requirementsPath
  if ($LASTEXITCODE -ne 0) {
    throw "Could not install the project Python dependencies."
  }
  Set-Content -LiteralPath $requirementsStampPath -Value $requirementsHash -NoNewline
}

Set-Location $projectRoot

# Build the browser bundle (static/dist) from static/js and static/css.
$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npm) {
  throw "Node.js/npm is required to build the frontend. Install Node.js 22 or newer."
}
# Reinstall npm packages whenever package-lock.json changes (for example after
# pulling), so the build never runs against a stale node_modules.
$packageLockPath = Join-Path $projectRoot "package-lock.json"
$nodeModulesPath = Join-Path $projectRoot "node_modules"
$packageStampPath = Join-Path $nodeModulesPath ".package-lock.sha256"
$packageLockHash = (Get-FileHash -LiteralPath $packageLockPath -Algorithm SHA256).Hash
$installedPackageHash = if (Test-Path -LiteralPath $packageStampPath) {
  (Get-Content -LiteralPath $packageStampPath -Raw).Trim()
} else {
  ""
}
if ($packageLockHash -ne $installedPackageHash) {
  & $npm.Source ci
  if ($LASTEXITCODE -ne 0) { throw "Could not install the frontend dependencies." }
  Set-Content -LiteralPath $packageStampPath -Value $packageLockHash -NoNewline
}
& $npm.Source run build
if ($LASTEXITCODE -ne 0) { throw "The frontend build failed." }

$env:PYTHONUNBUFFERED = "1"
& $pythonPath server.py
