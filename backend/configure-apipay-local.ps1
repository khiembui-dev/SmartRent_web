param([string]$BankPublicId = 'cmwf0n7b20xp301tjzi8z6dpc')
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'tools/ApiPay.Local.psm1') -Force
$access = Read-Host 'ApiPay access key (hidden)' -AsSecureString
$secret = Read-Host 'ApiPay secret key (hidden)' -AsSecureString
try {
    Set-ApiPayLocalCredentials -AccessKey $access -SecretKey $secret
    $config = Read-ApiPayLocalConfig
    $config.BankPublicId = $BankPublicId
    $bank = Invoke-ApiPayClientRequest -Config $config -Path ('/v1/client/banks/' + $BankPublicId)
    if (-not $bank.data.status -or $bank.data.message.status -ne 'ACTIVE') { throw 'The chosen ApiPay bank is missing or not ACTIVE.' }
    Save-ApiPayLocalConfig $config
    Write-Host 'ApiPay credentials are encrypted for this Windows account. Run backend/start-apipay-local.ps1 to activate.'
}
finally { $access.Dispose(); $secret.Dispose() }
