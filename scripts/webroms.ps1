param(
    [ValidateSet('help', 'start', 'dev', 'build', 'test', 'gis', 'browser', 'check', 'package')]
    [string]$Task = 'help'
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
if ($Task -eq 'help') {
    Write-Host 'WebROMS script entry point'
    Write-Host 'Usage: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/webroms.ps1 -Task <task>'
    Write-Host 'start   : Open WebROMS (no Node.js required)'
    Write-Host 'dev     : Build and run the development server'
    Write-Host 'build   : Assemble dist/'
    Write-Host 'test    : Run the core automated tests'
    Write-Host 'gis     : Test terrain and GIS file import/export'
    Write-Host 'browser : Run browser tests (Chrome required)'
    Write-Host 'check   : Verify release integrity and reference cases'
    Write-Host 'package : Build, verify, and create the Windows ZIP'
    Write-Host 'Details: scripts/README.md and docs/SCRIPT_GUIDE.md'
    exit 0
}
Push-Location $repo
try {
    if ($Task -eq 'start') {
        & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repo 'scripts/windows-launcher/start-webroms.ps1')
    } else {
        $commands = @{ dev = 'dev'; build = 'build'; test = 'test'; gis = 'test:gis'; browser = 'test:browser'; check = 'check:release'; package = 'package:windows' }
        if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) { throw 'Install Node.js >=22 and pnpm for development tasks. To use the app, open the 00_WebROMS launcher instead.' }
        & pnpm $commands[$Task]
    }
    if ($LASTEXITCODE -ne 0) { throw "Task failed with exit code $LASTEXITCODE" }
} finally { Pop-Location }
