# Cấu hình riêng cho máy Windows. DPAPI mã hóa SecureString theo đúng tài khoản Windows hiện tại.
# Không ghi khóa vào repo, .env, tham số khởi động tiến trình, stdout hoặc log.
$ErrorActionPreference = 'Stop'

function Get-ApiPayPrivatePath {
    if (-not $env:LOCALAPPDATA) { throw 'Local ApiPay setup requires Windows LOCALAPPDATA.' }
    return Join-Path $env:LOCALAPPDATA 'SmartRent/payments/apipay.credentials.clixml'
}

function Read-ApiPayLocalConfig {
    $path = Get-ApiPayPrivatePath
    if (Test-Path -LiteralPath $path) { return Import-Clixml -LiteralPath $path }
    return @{ Version=1; BankPublicId='cmwf0n7b20xp301tjzi8z6dpc' }
}

function Save-ApiPayLocalConfig([hashtable]$Config) {
    $path = Get-ApiPayPrivatePath
    $folder = Split-Path -Parent $path
    New-Item -ItemType Directory -Path $folder -Force | Out-Null
    $temporary = Join-Path $folder ('config-' + [Guid]::NewGuid().ToString('N') + '.tmp')
    $Config | Export-Clixml -LiteralPath $temporary -Depth 8
    Move-Item -LiteralPath $temporary -Destination $path -Force
}

function Set-ApiPayLocalCredentials([Security.SecureString]$AccessKey, [Security.SecureString]$SecretKey) {
    if (-not $AccessKey.Length -or -not $SecretKey.Length) { throw 'Both ApiPay keys are required.' }
    $config = Read-ApiPayLocalConfig
    $config.AccessKey = $AccessKey
    $config.SecretKey = $SecretKey
    Save-ApiPayLocalConfig $config
}

function ConvertFrom-ApiPaySecureValue([Security.SecureString]$Value) {
    if (-not $Value) { return '' }
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}

function Invoke-ApiPayClientRequest([hashtable]$Config, [string]$Path, [string]$Method='GET', $Body=$null) {
    if (-not $Path.StartsWith('/v1/client/')) { throw 'Invalid ApiPay client path.' }
    $access = ConvertFrom-ApiPaySecureValue $Config.AccessKey
    $secret = ConvertFrom-ApiPaySecureValue $Config.SecretKey
    if (-not $access -or -not $secret) { throw 'ApiPay keys are not configured for this Windows account.' }
    $auth = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($access + ':' + $secret))
    $arguments = @{ Uri=('https://app.apipay.vn' + $Path); Method=$Method; Headers=@{Authorization=('Bearer ' + $auth)};
        UseBasicParsing=$true; TimeoutSec=20; MaximumRedirection=0; ErrorAction='Stop' }
    if ($null -ne $Body) { $arguments.ContentType='application/json; charset=utf-8'; $arguments.Body=[Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 10 -Compress)) }
    try {
        $response = Invoke-WebRequest @arguments
        return ($response.Content | ConvertFrom-Json)
    }
    catch {
        $status = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
        # Không trả body, header hoặc inner exception của provider: có thể chứa dữ liệu nhạy cảm.
        throw ('ApiPay request failed (HTTP ' + $status + '). Check API key permissions and bank connection in the dashboard.')
    }
    finally { $access=$null; $secret=$null; $auth=$null; $arguments=$null }
}

function Set-ApiPayProcessEnvironment([hashtable]$Config) {
    foreach ($required in @('AccessKey','SecretKey','WebhookSecret','WebhookUrl','BankPublicId')) {
        if (-not $Config[$required]) { throw ('ApiPay local configuration is missing ' + $required + '.') }
    }
    $env:APIPAY_ACCESS_KEY = ConvertFrom-ApiPaySecureValue $Config.AccessKey
    $env:APIPAY_SECRET_KEY = ConvertFrom-ApiPaySecureValue $Config.SecretKey
    $env:APIPAY_WEBHOOK_SECRET = ConvertFrom-ApiPaySecureValue $Config.WebhookSecret
    $env:APIPAY_WEBHOOK_URL = $Config.WebhookUrl
    $env:APIPAY_BANK_PUBLIC_ID = $Config.BankPublicId
    $env:APIPAY_TRUSTED_PROXIES = '127.0.0.1,::1'
    $env:APIPAY_ENABLED = 'true'
}

Export-ModuleMember -Function Get-ApiPayPrivatePath,Read-ApiPayLocalConfig,Save-ApiPayLocalConfig,Set-ApiPayLocalCredentials,Invoke-ApiPayClientRequest,Set-ApiPayProcessEnvironment
