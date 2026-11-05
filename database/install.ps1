param(
    [string]$DbHost = '127.0.0.1',
    [int]$Port = 5432,
    [string]$DbUser = 'postgres',
    [string]$DatabaseName = 'smartrent',
    [string]$PsqlPath = 'C:\Program Files\PostgreSQL\16\bin\psql.exe',
    [switch]$WithDemo
)
$ErrorActionPreference = 'Stop'
if ($DatabaseName -notmatch '^[a-z][a-z0-9_]{0,62}$') { throw 'DatabaseName must contain lowercase letters, digits and underscores only.' }
if (-not (Test-Path -LiteralPath $PsqlPath)) { throw 'psql not found. Supply its location with -PsqlPath.' }
$env:PGCLIENTENCODING = 'UTF8'
$connection = @('-X', '-h', $DbHost, '-p', "$Port", '-U', $DbUser, '-v', 'ON_ERROR_STOP=1')
$existing = & $PsqlPath @connection -d postgres -Atc "SELECT 1 FROM pg_database WHERE datname='$DatabaseName'"
if ($LASTEXITCODE -ne 0) { throw 'Cannot connect to PostgreSQL. Configure PGPASSWORD or pgpass on this machine.' }
if ($existing -eq '1') { throw "Database $DatabaseName already exists. This installer only creates a new database." }
& $PsqlPath @connection -d postgres -c "CREATE DATABASE $DatabaseName"
if ($LASTEXITCODE -ne 0) { throw 'Database creation failed.' }
$scripts = @('01_schema.sql','02_rules.sql','03_seed.sql')
if ($WithDemo) { $scripts += '05_demo.sql' }
foreach ($script in $scripts) {
    & $PsqlPath @connection -d $DatabaseName -q -f (Join-Path $PSScriptRoot $script)
    if ($LASTEXITCODE -ne 0) { throw "Loading $script failed. The new database remains available for inspection." }
}
Write-Host "Created $DatabaseName with 13 tables. See database/README.md for admin provisioning and backend SQL permissions."
