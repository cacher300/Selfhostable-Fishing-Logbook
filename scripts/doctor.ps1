[CmdletBinding()]
param()

$projectRoot = Split-Path -Parent $PSScriptRoot
$expectedPython = (Get-Content -LiteralPath (Join-Path $projectRoot ".python-version") -Raw).Trim()
$venvPython = Join-Path $projectRoot ".venv\Scripts\python.exe"
$failures = [System.Collections.Generic.List[string]]::new()

function Write-Check {
  param(
    [string]$Name,
    [bool]$Ok,
    [string]$Detail,
    [switch]$Required
  )

  $state = if ($Ok) { "OK" } elseif ($Required) { "FAIL" } else { "WARN" }
  Write-Output ("[{0}] {1}: {2}" -f $state, $Name, $Detail)
  if (-not $Ok -and $Required) { $failures.Add($Name) }
}

$pyLauncher = Get-Command py -ErrorAction SilentlyContinue
Write-Check "Python launcher" ($null -ne $pyLauncher) $(if ($pyLauncher) { $pyLauncher.Source } else { "not found" }) -Required

if ($pyLauncher) {
  $pythonVersionOutput = (& $pyLauncher.Source "-$expectedPython" --version 2>$null | Out-String).Trim()
  $pythonAvailable = ($LASTEXITCODE -eq 0)
  Write-Check "Python $expectedPython" $pythonAvailable $pythonVersionOutput -Required
}

$venvExists = Test-Path -LiteralPath $venvPython
Write-Check "Project virtual environment" $venvExists $venvPython -Required

if ($venvExists) {
  $venvVersion = (& $venvPython -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>$null).Trim()
  Write-Check "Virtualenv version" ($venvVersion -eq $expectedPython) $venvVersion -Required

  & $venvPython -c "import flask, PIL, pillow_heif, pytest, gunicorn" 2>$null
  Write-Check "Python dependencies" ($LASTEXITCODE -eq 0) "Flask/Pillow/pillow-heif/pytest/gunicorn" -Required
}

$node = Get-Command node -ErrorAction SilentlyContinue
Write-Check "Node.js" ($null -ne $node) $(if ($node) { (& $node.Source --version).Trim() } else { "not found" }) -Required

$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
Write-Check "npm" ($null -ne $npm) $(if ($npm) { (& $npm.Source --version).Trim() } else { "not found" }) -Required

$packageLock = Test-Path -LiteralPath (Join-Path $projectRoot "package-lock.json")
Write-Check "Root package lock" $packageLock "package-lock.json" -Required

$playwrightPackage = Test-Path -LiteralPath (Join-Path $projectRoot "node_modules\@playwright\test")
Write-Check "Playwright package" $playwrightPackage "node_modules/@playwright/test" -Required

if ($playwrightPackage) {
  Push-Location $projectRoot
  & $npm.Source exec playwright install --dry-run chromium 2>$null
  Write-Check "Playwright Chromium install plan" ($LASTEXITCODE -eq 0) "npx playwright install chromium" -Required
  Pop-Location
}

$docker = Get-Command docker -ErrorAction SilentlyContinue
Write-Check "Docker" ($null -ne $docker) $(if ($docker) { (& $docker.Source --version).Trim() } else { "optional for local development" })

if ($failures.Count -gt 0) {
  Write-Error ("Doctor found required problems: " + ($failures -join ", "))
  exit 1
}

Write-Output "Doctor checks passed."
