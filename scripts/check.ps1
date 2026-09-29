[CmdletBinding()]
param()

$projectRoot = Split-Path -Parent $PSScriptRoot
$pythonPath = Join-Path $projectRoot ".venv\Scripts\python.exe"

if (-not (Test-Path -LiteralPath $pythonPath)) {
  throw "Project virtual environment is missing. Run .\scripts\run-local.ps1 first."
}

Set-Location $projectRoot

function Invoke-Step([string]$Name, [scriptblock]$Command) {
  & $Command
  if ($LASTEXITCODE -ne 0) { throw "$Name failed." }
}

Invoke-Step "Python compilation" { & $pythonPath -m compileall -q server.py backend scripts }
Invoke-Step "Python tests" { & $pythonPath -m pytest tests -q }
Invoke-Step "Schema artifact freshness" { & npm.cmd run schema:check }
Invoke-Step "Lint" { & npm.cmd run lint }
Invoke-Step "Node tests" { & npm.cmd test }
Invoke-Step "Frontend build" { & npm.cmd run build }
Invoke-Step "Standalone build" { & $pythonPath scripts/build-standalone.py }
Invoke-Step "Playwright tests" { & npm.cmd run test:e2e }

Write-Output "All project checks passed."
