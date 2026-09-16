Set-StrictMode -Version Latest

function Invoke-CheckedCommand {
    param([string]$Executable, [string[]]$Arguments, [string]$WorkingDirectory)
    $null = Get-Command $Executable -ErrorAction Stop
    $previousPreference = $ErrorActionPreference
    Push-Location -LiteralPath $WorkingDirectory
    try {
        # PowerShell 5 treats native stderr warnings as errors. Use the exit code.
        $ErrorActionPreference = 'Continue'
        & $Executable @Arguments
        $commandExitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousPreference
        Pop-Location
    }
    if ($commandExitCode -ne 0) { throw "Command failed with exit code ${commandExitCode}: $Executable" }
}

function Get-ComponentPython {
    param([string]$Component)
    $pythonPath = Join-Path $ProjectRoot "$Component\.venv\Scripts\python.exe"
    if (-not (Test-Path -LiteralPath $pythonPath -PathType Leaf)) {
        throw "Missing $Component Python environment. Run project.cmd setup first."
    }
    return $pythonPath
}

function New-RandomSecret {
    $secretBytes = New-Object byte[] 32
    $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $generator.GetBytes($secretBytes) } finally { $generator.Dispose() }
    return ([BitConverter]::ToString($secretBytes)).Replace('-', '').ToLowerInvariant()
}

function Initialize-BackendEnvironment {
    $environmentPath = Join-Path $ProjectRoot 'backend\.env'
    if (Test-Path -LiteralPath $environmentPath) { return }
    $databasePassword = New-RandomSecret
    $content = @(
        "DATABASE_URL=postgresql+psycopg://urban:$databasePassword@127.0.0.1:5432/urban_ai"
        "POSTGRES_PASSWORD=$databasePassword"
        ('JWT_SECRET=' + (New-RandomSecret))
        ('EDGE_API_KEY=' + (New-RandomSecret))
        'ALLOWED_ORIGINS=["http://localhost:3000","http://localhost:5173"]'
    ) -join [Environment]::NewLine
    $stream = [IO.File]::Open($environmentPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write)
    try {
        $bytes = [Text.Encoding]::UTF8.GetBytes($content + [Environment]::NewLine)
        $stream.Write($bytes, 0, $bytes.Length)
    }
    finally { $stream.Dispose() }
    Write-Host 'Created backend/.env with generated local credentials.'
}

function Test-DockerReady {
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & docker info --format '{{.ServerVersion}}' *> $null
        return ($LASTEXITCODE -eq 0)
    }
    finally { $ErrorActionPreference = $previousPreference }
}

function Start-ProjectDocker {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker Desktop is required. Install it and retry.' }
    if (Test-DockerReady) { return }
    $desktopPath = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
    if (-not (Test-Path -LiteralPath $desktopPath)) { throw 'Start your Docker engine, then retry.' }
    Start-Process -FilePath $desktopPath -WindowStyle Hidden
    Write-Host 'Waiting for Docker Desktop to start...'
    $deadline = (Get-Date).AddSeconds(120)
    do {
        Start-Sleep -Seconds 2
        if (Test-DockerReady) { return }
    } while ((Get-Date) -lt $deadline)
    throw 'Docker did not become ready within two minutes. Check Docker Desktop and retry.'
}

function Invoke-ProjectCompose {
    param([string[]]$ComposeArguments)
    $backendPath = Join-Path $ProjectRoot 'backend'
    $composeOptions = @('compose', '--project-name', 'backend', '--project-directory', $backendPath,
                        '--env-file', (Join-Path $backendPath '.env'), '-f', (Join-Path $backendPath 'docker-compose.yml'))
    Invoke-CheckedCommand -Executable 'docker' -Arguments ($composeOptions + $ComposeArguments) -WorkingDirectory $ProjectRoot
}

function Confirm-BackendHealth {
    $health = Invoke-RestMethod -Uri 'http://localhost:8000/api/v1/health' -TimeoutSec 10
    if ($health.status -ne 'ok' -or $health.database -ne 'connected') { throw 'The backend is responding, but its database check failed.' }
    Write-Host 'Backend: running | Database: connected'
    Write-Host 'API documentation: http://localhost:8000/docs'
}

function Start-ProjectFrontend {
    if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw 'Node.js/npm is required. Install it and retry.' }
    $pidPath = Join-Path $env:TEMP 'codyssey-frontend.pid'
    if (Test-Path -LiteralPath $pidPath) {
        $existingPid = [int](Get-Content -LiteralPath $pidPath -Raw)
        if (Get-Process -Id $existingPid -ErrorAction SilentlyContinue) {
            Write-Host 'Frontend: already running at http://localhost:3000'
            return
        }
        Remove-Item -LiteralPath $pidPath -Force
    }
    $frontendPath = Join-Path $ProjectRoot 'frontend'
    if (-not (Test-Path -LiteralPath (Join-Path $frontendPath 'node_modules') -PathType Container)) {
        throw 'Frontend dependencies are missing. Run: cd frontend; npm install'
    }
    $stdoutPath = Join-Path $env:TEMP 'codyssey-frontend.out.log'
    $stderrPath = Join-Path $env:TEMP 'codyssey-frontend.err.log'
    $process = Start-Process -FilePath 'cmd.exe' -ArgumentList @('/d', '/c', 'set BROWSER=none&& npm start') -WindowStyle Hidden -WorkingDirectory $frontendPath -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -PassThru
    Set-Content -LiteralPath $pidPath -Value $process.Id -NoNewline
    $deadline = (Get-Date).AddSeconds(120)
    do {
        try {
            $response = Invoke-WebRequest -Uri 'http://localhost:3000' -TimeoutSec 2 -UseBasicParsing
            if ($response.StatusCode -eq 200) {
                Write-Host 'Frontend: running at http://localhost:3000'
                return
            }
        }
        catch { }
        Start-Sleep -Seconds 2
    } while ((Get-Date) -lt $deadline)
    throw "Frontend did not become ready. See $stderrPath"
}

function Stop-ProjectFrontend {
    $pidPath = Join-Path $env:TEMP 'codyssey-frontend.pid'
    if (-not (Test-Path -LiteralPath $pidPath)) {
        Write-Host 'Frontend: not running'
        return
    }
    $frontendPid = [int](Get-Content -LiteralPath $pidPath -Raw)
    if (Get-Process -Id $frontendPid -ErrorAction SilentlyContinue) { & taskkill.exe /PID $frontendPid /T /F *> $null }
    Remove-Item -LiteralPath $pidPath -Force
    Write-Host 'Frontend: stopped'
}

function Confirm-FrontendHealth {
    try {
        $response = Invoke-WebRequest -Uri 'http://localhost:3000' -TimeoutSec 5 -UseBasicParsing
        if ($response.StatusCode -eq 200) {
            Write-Host 'Frontend: running at http://localhost:3000'
            return
        }
    }
    catch { }
    throw 'Frontend is not responding at http://localhost:3000.'
}
