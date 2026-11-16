$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$env:XDG_CONFIG_HOME = Join-Path $projectRoot '.wrangler-alt'
npx wrangler whoami
