[CmdletBinding()]
param()

$projectRoot = Split-Path -Parent $PSScriptRoot
$pythonPath = Join-Path $projectRoot ".venv\Scripts\python.exe"

if (-not (Test-Path -LiteralPath $pythonPath)) {
  throw "Project virtual environment is missing. Run .\scripts\run-local.ps1 first."
}

Set-Location $projectRoot

& $pythonPath -m compileall server.py backend
if ($LASTEXITCODE -ne 0) { throw "Python compilation failed." }

& $pythonPath -m pytest tests -q
if ($LASTEXITCODE -ne 0) { throw "Python tests failed." }

& npm.cmd test
if ($LASTEXITCODE -ne 0) { throw "Node tests failed." }

& $pythonPath scripts/build-standalone.py --check
if ($LASTEXITCODE -ne 0) { throw "Generated standalone.html is stale." }

& npm.cmd run test:e2e
if ($LASTEXITCODE -ne 0) { throw "Playwright smoke tests failed." }

Write-Output "All project checks passed."
