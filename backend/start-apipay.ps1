param(
    [Parameter(Mandatory=$true)][string]$WebhookUrl,
    [string]$TrustedProxies = '',
    [string]$Urls = 'http://127.0.0.1:5080'
)
$ErrorActionPreference = 'Stop'
$endpoint = [Uri]$WebhookUrl
if (-not $endpoint.IsAbsoluteUri -or $endpoint.Scheme -ne 'https' -or $endpoint.AbsolutePath -ne '/api/v1/apipay/webhook' -or $endpoint.Query -or $endpoint.Fragment -or $endpoint.UserInfo) {
    throw 'WebhookUrl phải là URL HTTPS công khai, kết thúc bằng /api/v1/apipay/webhook.'
}
# Nhập bằng SecureString để secret không vào lịch sử lệnh hoặc file. Chỉ truyền env cho backend con.
$names = @('APIPAY_ENABLED','APIPAY_WEBHOOK_URL','APIPAY_TRUSTED_PROXIES','APIPAY_ACCESS_KEY','APIPAY_SECRET_KEY','APIPAY_WEBHOOK_SECRET')
$previous = @{}
foreach ($key in $names) { $previous[$key] = [Environment]::GetEnvironmentVariable($key,'Process') }
try {
    foreach ($key in @('APIPAY_ACCESS_KEY','APIPAY_SECRET_KEY','APIPAY_WEBHOOK_SECRET')) {
        if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($key,'Process'))) {
            $secretInput = Read-Host "Nhập $key (không hiển thị)" -AsSecureString
            $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secretInput)
            try { [Environment]::SetEnvironmentVariable($key,[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer),'Process') }
            finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer); $secretInput.Dispose() }
        }
        if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($key,'Process'))) { throw "Thiếu $key." }
    }
    $env:APIPAY_ENABLED = 'true'
    $env:APIPAY_WEBHOOK_URL = $WebhookUrl
    $env:APIPAY_TRUSTED_PROXIES = $TrustedProxies
    $project = Join-Path $PSScriptRoot 'src/SmartRent.Api'
    & dotnet run --project $project --launch-profile http -- --urls $Urls
    if ($LASTEXITCODE -ne 0) { throw 'Backend dừng với lỗi. Kiểm tra cổng và kết nối SQL.' }
}
finally {
    foreach ($key in $names) { [Environment]::SetEnvironmentVariable($key,$previous[$key],'Process') }
}
