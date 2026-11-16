$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$nodePath = (Get-Command node).Source
$taskName = 'CompanyAutomationBot'
$argument = "`"$projectRoot\server.js`""
$action = New-ScheduledTaskAction -Execute $nodePath -Argument $argument -WorkingDirectory $projectRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description 'Starts Company Bot for the signed-in user.' -Force
Write-Host "Installed scheduled task: $taskName"
