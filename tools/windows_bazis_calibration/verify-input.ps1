param([Parameter(Mandatory=$true)][string]$FixtureId)
. "$PSScriptRoot\common.ps1"
$null = Assert-SafePath $PSScriptRoot
$manifest = Read-Json "$PSScriptRoot\manifest.json"
$entry = @($manifest.fixtures | Where-Object { $_.id -ceq $FixtureId })
if ($entry.Count -ne 1) { throw 'Unknown fixture identity' }
$entry = $entry[0]
foreach ($relative in @($entry.input,$entry.sidecar)) {
    if ($relative -match '\.\.|^[/\\]|:') { throw 'Invalid manifest path' }
    $file = Join-Path $PSScriptRoot $relative
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw 'Required original/input missing' }
    if ((Get-Item -LiteralPath $file -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Reparse input' }
}
$inputPath = Join-Path $PSScriptRoot $entry.input
if ((Get-Item -LiteralPath $inputPath).Length -ne $entry.size -or (Get-FileHash -LiteralPath $inputPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $entry.sha256) { throw 'HASH_MISMATCH input' }
if ((Get-FileHash -LiteralPath (Join-Path $PSScriptRoot $entry.sidecar) -Algorithm SHA256).Hash.ToLowerInvariant() -cne $entry.sidecar_sha256) { throw 'HASH_MISMATCH sidecar' }
[pscustomobject]@{checked_at=(Get-Date).ToUniversalTime().ToString('o');fixture_id=$FixtureId;sha256=$entry.sha256;input=$entry.input;status='INPUT_INTEGRITY_ONLY';native='NOT VERIFIED'} | ConvertTo-Json
