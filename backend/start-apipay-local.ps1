param([switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'tools/ApiPay.Local.psm1') -Force
$project = Join-Path $PSScriptRoot 'src/SmartRent.Api'
$dll = Join-Path $project 'bin/Debug/net10.0/SmartRent.Api.dll'
$privateFolder = Split-Path -Parent (Get-ApiPayPrivatePath)
New-Item -ItemType Directory -Path $privateFolder -Force | Out-Null
$config = Read-ApiPayLocalConfig
if (-not $config.AccessKey -or -not $config.SecretKey) {
    $access = Read-Host 'ApiPay access key (hidden)' -AsSecureString
    $secret = Read-Host 'ApiPay secret key (hidden)' -AsSecureString
    try { Set-ApiPayLocalCredentials -AccessKey $access -SecretKey $secret }
    finally { $access.Dispose(); $secret.Dispose() }
    $config = Read-ApiPayLocalConfig
}

# Read-only provider check; never change bank state or ask for bank login/OTP.
$bank = Invoke-ApiPayClientRequest -Config $config -Path ('/v1/client/banks/' + $config.BankPublicId)
if (-not $bank.data.status -or $bank.data.message.status -ne 'ACTIVE') { throw 'The selected ApiPay bank is not ACTIVE.' }

# Pinned official release, verified against the SHA-256 published by Cloudflare.
$version = '2026.11.0'
$sha256 = 'd5c1d82031da6253dcdcff64c944cd0fe063016edeb2e4fd088075fc9bd52d0a'
$toolFolder = Join-Path $env:LOCALAPPDATA ('SmartRent/tools/cloudflared/' + $version)
$cloudflared = Join-Path $toolFolder 'cloudflared.exe'
if (-not (Test-Path -LiteralPath $cloudflared)) {
    New-Item -ItemType Directory -Path $toolFolder -Force | Out-Null
    Invoke-WebRequest -UseBasicParsing -Uri ('https://github.com/cloudflare/cloudflared/releases/download/' + $version + '/cloudflared-windows-amd64.exe') -OutFile $cloudflared
}
if ((Get-FileHash -LiteralPath $cloudflared -Algorithm SHA256).Hash.ToLowerInvariant() -ne $sha256) { throw 'Cloudflared checksum mismatch. The downloaded file will not run.' }

function Get-OwnedProcess([int]$ProcessId, [string]$ExpectedPath) {
    if ($ProcessId -le 0) { return $null }
    $process = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $ProcessId) -ErrorAction SilentlyContinue
    if ($process -and $process.CommandLine -and $process.CommandLine.IndexOf($ExpectedPath,[StringComparison]::OrdinalIgnoreCase) -ge 0) { return $process }
    return $null
}

# Stop only this project's API before building. Preserve PostgreSQL and all business data.
$listeners = @(Get-NetTCPConnection -LocalPort 5080,5081 -State Listen -ErrorAction SilentlyContinue)
foreach ($processId in @($listeners.OwningProcess | Sort-Object -Unique)) {
    $owned = Get-OwnedProcess -ProcessId $processId -ExpectedPath $dll
    if (-not $owned) { throw 'Port 5080 or 5081 is occupied by a process outside this project.' }
    Stop-Process -Id $processId
}
if (-not $SkipBuild) {
    & dotnet build (Join-Path $PSScriptRoot 'SmartRent.sln') --no-restore -p:UseAppHost=false
    if ($LASTEXITCODE -ne 0) { throw 'Backend build failed.' }
}
if (-not (Test-Path -LiteralPath $dll)) { throw 'Backend DLL is missing; run without -SkipBuild.' }

$tunnel = Get-OwnedProcess -ProcessId ([int]$config.TunnelProcessId) -ExpectedPath $cloudflared
if ($tunnel -and -not $tunnel.CommandLine.Contains('http://127.0.0.1:5081')) { $tunnel=$null }
if (-not $tunnel -or -not $config.WebhookUrl) {
    $nonce = [Guid]::NewGuid().ToString('N')
    $output = Join-Path $privateFolder ('tunnel-' + $nonce + '.out.log')
    $errors = Join-Path $privateFolder ('tunnel-' + $nonce + '.err.log')
    $tunnel = Start-Process -FilePath $cloudflared -ArgumentList @('tunnel','--no-autoupdate','--protocol','http2','--url','http://127.0.0.1:5081') -WindowStyle Hidden -RedirectStandardOutput $output -RedirectStandardError $errors -PassThru
    $deadline = (Get-Date).AddSeconds(45)
    $publicOrigin = $null
    while ((Get-Date) -lt $deadline) {
        $tunnel.Refresh()
        if ($tunnel.HasExited) { throw 'Cloudflare local tunnel did not start. Check its local log.' }
        $log = if (Test-Path -LiteralPath $errors) { Get-Content -LiteralPath $errors -Raw } else { '' }
        if ($log -match 'https://[a-z0-9-]+\.trycloudflare\.com') { $publicOrigin=$Matches[0]; break }
        Start-Sleep -Milliseconds 400
    }
    if (-not $publicOrigin) { throw 'Cloudflare did not return an HTTPS URL in time.' }
    $config.TunnelProcessId = $tunnel.Id
    $config.WebhookUrl = $publicOrigin + '/api/v1/apipay/webhook'
    Save-ApiPayLocalConfig $config
}

$registration = @{ webhookUrl=$config.WebhookUrl; bankPublicIds=@($config.BankPublicId); isActive=$true; timeoutSeconds=10 }
if ($config.WebhookId -and $config.WebhookSecret) {
    $null = Invoke-ApiPayClientRequest -Config $config -Path ('/v1/client/webhooks/' + $config.WebhookId) -Method PATCH -Body $registration
}
else {
    # Quick Tunnel DNS may need a few seconds. Recover an already-created resource before retrying registration.
    # No payment-request POST is retried here; this only registers the webhook configuration.
    $registered = $false
    for ($attempt=0; $attempt -lt 3; $attempt++) {
        $listed = Invoke-ApiPayClientRequest -Config $config -Path '/v1/client/webhooks?limit=50'
        $owned = @($listed.data.data | Where-Object { $_.webhookUrl -eq $config.WebhookUrl })
        if ($owned.Count -eq 1 -and $owned[0].secret) {
            $config.WebhookId=$owned[0].id
            $config.WebhookSecret=ConvertTo-SecureString $owned[0].secret -AsPlainText -Force
            $registered=$true
            break
        }
        if ($owned.Count -gt 0) { throw 'A matching webhook exists but its secret cannot be recovered; check the dashboard.' }
        try {
            $created = Invoke-ApiPayClientRequest -Config $config -Path '/v1/client/webhooks' -Method POST -Body $registration
            if (-not $created.data.id -or -not $created.data.secret) { throw 'ApiPay did not return a webhook ID and secret.' }
            $config.WebhookId = $created.data.id
            $config.WebhookSecret = ConvertTo-SecureString $created.data.secret -AsPlainText -Force
            $created = $null
            $registered = $true
            break
        } catch {
            if ($attempt -eq 2) { throw }
            Start-Sleep -Seconds 2
        }
    }
    if (-not $registered) { throw 'Webhook registration did not complete.' }
}
Save-ApiPayLocalConfig $config

# Decrypt only to the backend process environment, restore the caller's environment immediately after spawning.
$names = @('APIPAY_ACCESS_KEY','APIPAY_SECRET_KEY','APIPAY_WEBHOOK_SECRET','APIPAY_WEBHOOK_URL','APIPAY_BANK_PUBLIC_ID','APIPAY_TRUSTED_PROXIES','APIPAY_WEBHOOK_LISTENER_PORT','APIPAY_ENABLED','ASPNETCORE_ENVIRONMENT')
$previous = @{}
foreach ($key in $names) { $previous[$key]=[Environment]::GetEnvironmentVariable($key,'Process') }
try {
    Set-ApiPayProcessEnvironment $config
    $env:APIPAY_WEBHOOK_LISTENER_PORT = '5081'
    $env:ASPNETCORE_ENVIRONMENT = 'Development'
    $api = Start-Process -FilePath dotnet -ArgumentList @(('"'+$dll+'"'),'--urls','http://127.0.0.1:5080;http://127.0.0.1:5081','--contentRoot',('"'+$project+'"')) -WindowStyle Hidden -WorkingDirectory $project -RedirectStandardOutput (Join-Path $privateFolder 'api.out.log') -RedirectStandardError (Join-Path $privateFolder 'api.err.log') -PassThru
    $config.ApiProcessId=$api.Id
    Save-ApiPayLocalConfig $config
}
finally { foreach ($key in $names) { [Environment]::SetEnvironmentVariable($key,$previous[$key],'Process') } }

$healthy = $false
for ($attempt=0; $attempt -lt 50; $attempt++) {
    if ($api.HasExited) { throw 'Backend did not start. Check its local log without sharing API keys.' }
    try {
        $health=Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:5080/api/v1/dev/database-check' -TimeoutSec 2
        if ($health.StatusCode -eq 200) { $healthy=$true; break }
    } catch { }
    Start-Sleep -Milliseconds 300
}
if (-not $healthy) { throw 'Backend database health check did not pass.' }
Write-Host 'ApiPay server configured. API: http://127.0.0.1:5080'
Write-Host ('HTTPS webhook: ' + $config.WebhookUrl)
Write-Host 'Only POST /api/v1/apipay/webhook is exposed on the tunnel. Keep the API and tunnel running to receive confirmations.'
