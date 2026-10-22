$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$PythonCandidates = @(
  (Join-Path $env:LOCALAPPDATA 'Programs\Python\Python311\python.exe'),
  (Join-Path $env:LOCALAPPDATA 'Programs\Python\Python312\python.exe'),
  (Join-Path $env:LOCALAPPDATA 'Programs\Python\Python310\python.exe')
)

$PythonPath = $PythonCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $PythonPath) {
  throw 'No se encontró Python 3.10+ en AppData\Local\Programs\Python.'
}

Push-Location $ProjectRoot
try {
  & $PythonPath (Join-Path $ProjectRoot 'automated_ml_retraining.py')
  if ($LASTEXITCODE -ne 0) {
    throw "El automatizador ML terminó con código $LASTEXITCODE."
  }
} finally {
  Pop-Location
}
