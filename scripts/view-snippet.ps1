param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [int]$Skip = 0,
    [int]$Take = 80
)

if (-not (Test-Path $Path)) {
    Write-Error "File not found: $Path"
    exit 1
}

Get-Content -Path $Path | Select-Object -Skip $Skip -First $Take
