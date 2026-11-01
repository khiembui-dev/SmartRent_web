# Cài database SmartRent vào PostgreSQL của máy này. Mật khẩu chỉ nhập tại máy, không ghi ra file.
#   powershell -ExecutionPolicy Bypass -File database\install.ps1              # chỉ cấu trúc, sẵn sàng nhập dữ liệu thật
#   powershell -ExecutionPolicy Bypass -File database\install.ps1 -SampleData  # kèm dữ liệu mẫu cho team backend
param(
    [string]$PgHost = 'localhost',
    [int]$Port = 5432,
    [string]$User = 'postgres',
    [string]$Database = 'smartrent',
    [string]$PsqlPath = 'C:\Program Files\PostgreSQL\16\bin\psql.exe',
    [switch]$SampleData
)
$ErrorActionPreference = 'Stop'
$folder = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not (Test-Path $PsqlPath)) { throw "Không tìm thấy psql ở $PsqlPath. Dùng tham số -PsqlPath để chỉ đúng đường dẫn." }

$env:PGHOST = $PgHost
$env:PGPORT = "$Port"
$env:PGUSER = $User
$env:PGCLIENTENCODING = 'UTF8'
$typedPassword = $false
if (-not $env:PGPASSWORD) {
    $secure = Read-Host "Mật khẩu PostgreSQL của tài khoản $User" -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    $typedPassword = $true
}

function Invoke-Sql([string]$Db, [string[]]$Arguments) {
    & $PsqlPath -X -q -v ON_ERROR_STOP=1 -d $Db @Arguments
    if ($LASTEXITCODE -ne 0) { throw 'Lệnh psql thất bại, xem lỗi ở trên.' }
}

try {
    $exists = & $PsqlPath -X -A -t -d postgres -c "SELECT 1 FROM pg_database WHERE datname = '$Database'"
    if ($LASTEXITCODE -ne 0) { throw 'Không kết nối được PostgreSQL. Kiểm tra mật khẩu, host, cổng.' }
    if ($exists) { throw "Database $Database đã tồn tại. Script không ghi đè để tránh mất dữ liệu. Đổi tên bằng -Database hoặc tự xử lý database cũ trước." }

    Write-Host "Tạo database $Database"
    Invoke-Sql 'postgres' @('-c', "CREATE DATABASE `"$Database`" WITH ENCODING = 'UTF8' TEMPLATE = template0")
    Invoke-Sql 'postgres' @('-c', "ALTER DATABASE `"$Database`" SET timezone TO 'Asia/Ho_Chi_Minh'")

    $scripts = @('01_schema.sql', '02_rules.sql', '03_seed.sql', '04_import_tools.sql')
    if ($SampleData) { $scripts += '06_du_lieu_mau.sql' }
    foreach ($script in $scripts) {
        Write-Host "Chạy $script"
        Invoke-Sql $Database @('-f', (Join-Path $folder $script))
    }
    $summary = & $PsqlPath -X -A -t -d $Database -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'smartrent' AND table_type = 'BASE TABLE'"
    Write-Host "Xong. Database $Database có $summary bảng trong schema smartrent."
    if (-not $SampleData) { Write-Host 'Bước tiếp theo: sửa database\05_du_lieu_thuc.sql rồi chạy để nhập dữ liệu thật.' }
}
finally {
    if ($typedPassword) { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
}
