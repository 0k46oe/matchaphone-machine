$ErrorActionPreference = "SilentlyContinue"
$workspace = "C:\Users\ling\Documents\Codex\2026-07-22\hi-2"
$pnpm = "C:\Users\ling\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd"
$createdNew = $false
$mutex = New-Object System.Threading.Mutex($true, "Local\ChachaMachineServerWatchdog", [ref]$createdNew)
if (-not $createdNew) { exit 0 }
try {
  while ($true) {
    $online = $false
    try {
      $response = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:5173/" -TimeoutSec 3
      $online = $response.StatusCode -eq 200
    } catch {}
    if ($online) {
      Start-Sleep -Seconds 15
      continue
    }
    $process = Start-Process -FilePath $pnpm -ArgumentList "dev" -WorkingDirectory $workspace -WindowStyle Hidden -PassThru
    if ($process) { $process.WaitForExit() }
    Start-Sleep -Seconds 3
  }
} finally {
  if ($createdNew) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}