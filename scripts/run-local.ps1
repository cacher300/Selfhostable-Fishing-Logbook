[CmdletBinding()]
param()

$projectRoot = Split-Path -Parent $PSScriptRoot
$venvPath = Join-Path $projectRoot ".venv"
$pythonPath = Join-Path $venvPath "Scripts\python.exe"

function New-VirtualEnvironment {
  if (Test-Path -LiteralPath $venvPath) {
    Remove-Item -LiteralPath $venvPath -Recurse -Force
  }

  $pythonLauncher = Get-Command py -ErrorAction SilentlyContinue
  if (-not $pythonLauncher) {
    throw "Python launcher 'py' was not found. Install Python 3.11+ and run this script again."
  }

  & $pythonLauncher.Source -3 -m venv $venvPath
  if ($LASTEXITCODE -ne 0) {
    throw "Could not create the project virtual environment."
  }
}

if (-not (Test-Path -LiteralPath $pythonPath)) {
  New-VirtualEnvironment
}

& $pythonPath -m pip --version 2>$null
if ($LASTEXITCODE -ne 0) {
  New-VirtualEnvironment
  & $pythonPath -m pip --version 2>$null
  if ($LASTEXITCODE -ne 0) {
    throw "Could not create a working pip installation in the project virtual environment."
  }
}

& $pythonPath -c "import flask; import PIL; import pillow_heif; import pytest" 2>$null
if ($LASTEXITCODE -ne 0) {
  & $pythonPath -m pip install --disable-pip-version-check -r (Join-Path $projectRoot "requirements.txt")
  if ($LASTEXITCODE -ne 0) {
    throw "Could not install the project Python dependencies."
  }
}

Set-Location $projectRoot
& $pythonPath server.py
