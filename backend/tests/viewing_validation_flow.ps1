# Compatibility entry point for the current viewing workflow regression.
[CmdletBinding()]
param([string]$BaseUrl='http://127.0.0.1:5080')
& "$PSScriptRoot/viewing_negotiation_flow.ps1" -BaseUrl $BaseUrl
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
