<#
.SYNOPSIS
Set up, start and check the Urban Intelligence project from one command.
.EXAMPLE
.\project.cmd start
.EXAMPLE
.\project.cmd traffic -Source .\traffic-ai\videos\road_test.mp4 -MaxFrames 100 -Show
#>
[CmdletBinding()]
param(
    [Parameter(Position=0)]
    [ValidateSet('help', 'setup', 'start', 'stop', 'status', 'test', 'traffic', 'train', 'helmet-check', 'hazard-check')]
    [string]$Action = 'help',
    [string]$Source = '',
    [string]$Model = '',
    [ValidateRange(0, 2147483647)][int]$MaxFrames = 0,
    [ValidateRange(1, 1000)][int]$Epochs = 4,
    [switch]$Show,
    [switch]$Integration,
    [switch]$Rebuild
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = $PSScriptRoot
. (Join-Path $ProjectRoot 'scripts\ProjectHelpers.ps1')

try {
    switch ($Action) {
        'help' {
            Write-Host @'
Run from this folder, or invoke project.cmd using its full path:
  .\project.cmd setup          Create environments and install pinned dependencies
    .\project.cmd start          Start Docker, backend, PostgreSQL and frontend
  .\project.cmd start -Rebuild  Rebuild the backend image after dependency changes
  .\project.cmd status         Check backend/database and local AI files
  .\project.cmd traffic        Process the supplied road_test.mp4 and save outputs
  .\project.cmd traffic -Source .\your-video.mp4 -MaxFrames 100 -Show
  .\project.cmd train -Epochs 4 Train a new vehicle-detector experiment
  .\project.cmd helmet-check   Load the supplied helmet model and show its classes
  .\project.cmd hazard-check   Report missing road-hazard models and training inputs
  .\project.cmd test           Run Traffic AI and backend unit tests
  .\project.cmd test -Integration  Also test real PostGIS in a dedicated test database
    .\project.cmd stop           Stop frontend/backend services while preserving database data

Traffic outputs: traffic-ai/outputs/
Training results: traffic-ai/training-runs/
AI observations are currently local exports; traffic publishing is not implemented.
'@
        }
        'setup' {
            foreach ($component in @('backend', 'traffic-ai')) {
                $componentPath = Join-Path $ProjectRoot $component
                $pythonPath = Join-Path $componentPath '.venv\Scripts\python.exe'
                if (-not (Test-Path -LiteralPath $pythonPath -PathType Leaf)) {
                    if (Get-Command py -ErrorAction SilentlyContinue) {
                        Invoke-CheckedCommand -Executable 'py' -Arguments @('-3.12', '-m', 'venv', (Join-Path $componentPath '.venv')) -WorkingDirectory $ProjectRoot
                    }
                    else {
                        Invoke-CheckedCommand -Executable 'python' -Arguments @('-c', 'import sys; assert sys.version_info[:2] == (3, 12), "Install Python 3.12"') -WorkingDirectory $ProjectRoot
                        Invoke-CheckedCommand -Executable 'python' -Arguments @('-m', 'venv', (Join-Path $componentPath '.venv')) -WorkingDirectory $ProjectRoot
                    }
                }
                $requirementsFile = if ($component -eq 'backend') { 'requirements-dev.txt' } else { 'requirements.txt' }
                Invoke-CheckedCommand -Executable $pythonPath -Arguments @('-m', 'pip', 'install', '--disable-pip-version-check', '--no-input', '-r', $requirementsFile, '-c', 'requirements-lock.txt') -WorkingDirectory $componentPath
                Invoke-CheckedCommand -Executable $pythonPath -Arguments @('-m', 'pip', 'check') -WorkingDirectory $componentPath
            }
            Initialize-BackendEnvironment
            Write-Host 'Setup complete. Run project.cmd start to launch the backend.'
        }
        'start' {
            Initialize-BackendEnvironment
            Start-ProjectDocker
            $composeArguments = @('up', '-d', '--wait', '--wait-timeout', '120')
            if ($Rebuild) { $composeArguments += '--build' }
            Invoke-ProjectCompose -ComposeArguments $composeArguments
            Start-ProjectFrontend
            Confirm-BackendHealth
            Confirm-FrontendHealth
        }
        'stop' {
            Stop-ProjectFrontend
            Invoke-ProjectCompose -ComposeArguments @('stop')
            Write-Host 'Services stopped. Database volumes are preserved.'
        }
        'status' {
            Confirm-BackendHealth
            Confirm-FrontendHealth
            foreach ($component in @('backend', 'traffic-ai')) {
                $null = Get-ComponentPython -Component $component
                Write-Host "$component Python environment: present"
            }
            foreach ($relativePath in @('traffic-ai\models\yolo26n.pt', 'helmet-ai\models\helmet_detector.pt')) {
                if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot $relativePath) -PathType Leaf)) { throw "Missing model: $relativePath" }
                Write-Host "Model present: $relativePath"
            }
            Write-Host 'Road-hazard module: run project.cmd hazard-check to inspect required local inputs.'
        }
        'test' {
            $trafficPython = Get-ComponentPython -Component 'traffic-ai'
            Invoke-CheckedCommand -Executable $trafficPython -Arguments @('-m', 'unittest', 'discover', '-s', 'tests', '-v') -WorkingDirectory (Join-Path $ProjectRoot 'traffic-ai')
            Invoke-CheckedCommand -Executable $trafficPython -Arguments @('-m', 'unittest', 'discover', '-s', 'tests', '-v') -WorkingDirectory (Join-Path $ProjectRoot 'road-hazard-ai')
            $backendPython = Get-ComponentPython -Component 'backend'
            $testArguments = @((Join-Path $ProjectRoot 'scripts\run_backend_tests.py'))
            if ($Integration) { $testArguments += '--integration' }
            Invoke-CheckedCommand -Executable $backendPython -Arguments $testArguments -WorkingDirectory (Join-Path $ProjectRoot 'backend')
        }
        'traffic' {
            $trafficPython = Get-ComponentPython -Component 'traffic-ai'
            $videoPath = if ($Source) { (Resolve-Path -LiteralPath $Source).Path } else { Join-Path $ProjectRoot 'traffic-ai\videos\road_test.mp4' }
            if (-not (Test-Path -LiteralPath $videoPath -PathType Leaf)) { throw 'Video not found. Provide -Source with an existing video file.' }
            $trafficArguments = @((Join-Path $ProjectRoot 'traffic-ai\traffic_ai.py'), '--source', $videoPath, '--save-video')
            if ($MaxFrames -gt 0) { $trafficArguments += @('--max-frames', $MaxFrames) }
            if ($Show) { $trafficArguments += '--show' }
            if ($Model) { $trafficArguments += @('--model', (Resolve-Path -LiteralPath $Model).Path) }
            Invoke-CheckedCommand -Executable $trafficPython -Arguments $trafficArguments -WorkingDirectory (Join-Path $ProjectRoot 'traffic-ai')
        }
        'train' {
            $null = Get-ComponentPython -Component 'traffic-ai'
            Invoke-CheckedCommand -Executable 'powershell' -Arguments @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $ProjectRoot 'traffic-ai\train.ps1'), '-Epochs', $Epochs) -WorkingDirectory $ProjectRoot
        }
        'helmet-check' {
            $trafficPython = Get-ComponentPython -Component 'traffic-ai'
            $helmetArguments = @((Join-Path $ProjectRoot 'helmet-ai\inspect_model.py'))
            if ($Model) { $helmetArguments += @('--model', (Resolve-Path -LiteralPath $Model).Path) }
            Invoke-CheckedCommand -Executable $trafficPython -Arguments $helmetArguments -WorkingDirectory (Join-Path $ProjectRoot 'helmet-ai')
        }
        'hazard-check' {
            $trafficPython = Get-ComponentPython -Component 'traffic-ai'
            Invoke-CheckedCommand -Executable $trafficPython -Arguments @((Join-Path $ProjectRoot 'road-hazard-ai\check_assets.py')) -WorkingDirectory (Join-Path $ProjectRoot 'road-hazard-ai')
        }
    }
    exit 0
}
catch {
    Write-Error -Message $_.Exception.Message -ErrorAction Continue
    exit 1
}
