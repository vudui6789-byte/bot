$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$nodePath = (Get-Command node).Source
$taskName = 'CompanyAutomationCloudAgent'
$argument = "--env-file=`"$projectRoot\\.env.agent`" `"$projectRoot\\src\\cloud-agent.js`""
$action = New-ScheduledTaskAction -Execute $nodePath -Argument $argument -WorkingDirectory $projectRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description 'Starts Company Bot Cloud Agent for the signed-in user.' -Force
Write-Host "Installed scheduled task: $taskName"
