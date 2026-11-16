$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$env:XDG_CONFIG_HOME = Join-Path $projectRoot '.wrangler-alt'
Write-Host "Using isolated Wrangler profile: $env:XDG_CONFIG_HOME"
npx wrangler login
