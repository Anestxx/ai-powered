param(
    [ValidateRange(1, 1000)][int]$Epochs = 4,
    [ValidateRange(1, 64)][int]$Batch = 2,
    [ValidateRange(64, 1920)][int]$ImageSize = 416,
    [ValidateRange(1, 64)][int]$Threads = 4,
    [ValidateRange(0.0000001, 0.1)][double]$LearningRate = 0.00005,
    [string]$Data = ''
)

$ErrorActionPreference = 'Stop'
Push-Location -LiteralPath $PSScriptRoot
try {
    $trainingLogs = Join-Path $PSScriptRoot 'training-runs'
    New-Item -ItemType Directory -Path $trainingLogs -Force | Out-Null
    $trainingLog = Join-Path $trainingLogs ('terminal-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.log')
    Write-Output "Training log: $trainingLog"
    # Windows PowerShell wraps native stderr as ErrorRecord; ordinary training
    # warnings must not terminate the process before its exit code is available.
    $ErrorActionPreference = 'Continue'
    $trainingArgs = @('-u', 'train_traffic.py', '--epochs', $Epochs, '--batch', $Batch, '--imgsz', $ImageSize, '--threads', $Threads, '--lr', $LearningRate.ToString([Globalization.CultureInfo]::InvariantCulture))
    if ($Data) { $trainingArgs += @('--data', $Data) }
    & .\.venv\Scripts\python.exe @trainingArgs 2>&1 | Tee-Object -FilePath $trainingLog
    $trainingExitCode = $LASTEXITCODE
}
finally {
    Pop-Location
}
exit $trainingExitCode
