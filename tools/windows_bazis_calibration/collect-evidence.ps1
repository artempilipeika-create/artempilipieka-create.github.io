# Copies allowlisted run data into a NEW evidence directory. Does not run native software.
param([Parameter(Mandatory=$true)][string]$TestRoot,[Parameter(Mandatory=$true)][string]$FixtureId,[Parameter(Mandatory=$true)][string]$RunId)
. "$PSScriptRoot\common.ps1"
$root=Assert-SafePath $TestRoot
$guid=[guid]::Parse($RunId)
if ($guid.ToString() -cne $RunId) { throw 'Canonical run UUID required' }
$source=Assert-Contained $root (Join-Path $root "work\$RunId")
& "$PSScriptRoot\verify-input.ps1" -FixtureId $FixtureId | Out-Null
$entry=(Read-Json "$PSScriptRoot\manifest.json").fixtures | Where-Object { $_.id -ceq $FixtureId }
$required=@('preflight.json','isolation-review.json','observations.json','local-mapping.json','input-check.json')
foreach ($n in $required) {
 $p=Assert-Contained $root (Join-Path $source $n)
 if (-not (Test-Path -LiteralPath $p -PathType Leaf)) { throw "Missing $n" }
}
$pre=Read-Json (Join-Path $source 'preflight.json')
$obs=Read-Json (Join-Path $source 'observations.json')
if ($pre.status -ne 'PRECHECK CLEAR FOR MANUAL REVIEW' -or $pre.test_root -ine $root) { throw 'Preflight not clear for this root' }
if ($obs.fixture_id -cne $FixtureId -or $obs.run_id -cne $RunId) { throw 'Observation binding mismatch' }
# Reject links before walking. Reject unsupported files and excessive output, not silent omission.
$files=@()
foreach ($n in $required) { $files+=Get-Item -LiteralPath (Join-Path $source $n) }
foreach ($dir in @('screenshots','outputs')) {
 $path=Assert-Contained $root (Join-Path $source $dir)
 if (-not (Test-Path -LiteralPath $path -PathType Container)) { throw "Missing $dir" }
 $found=@(Get-SafeFiles $path)
 if ($found.Count -eq 0) { throw "Empty $dir" }; $files+=$found
}
if ($files.Count -gt 500 -or ($files | Measure-Object Length -Sum).Sum -gt 1GB) { throw 'Bounded job artifacts only: max 500 files/1GiB' }
foreach ($f in $files) {
 if ($f.Extension -notmatch '^(?i)\.(json|png|jpg|jpeg|pdf|txt|csv|xml|oblx|b3d|bprj|xls|xlsx)$') { throw 'Unsupported artifact extension: explicit review required' }
 if ($f.Length -gt 256MB) { throw 'Artifact exceeds 256 MiB' }
 if ($f.Extension -match '^(?i)\.(json|txt|csv|xml|oblx)$') {
  if ($f.Length -gt 16MB) { throw 'Text artifact too large for secret screening' }
  $text=Get-Content -LiteralPath $f.FullName -Raw -Encoding UTF8
  if ($text -match '(?i)(AGENT_API_KEY|DATABASE_URL|password|lease_token|authorization|access_token)\s*[\x22\x27:=]' -or $text -match '(?i)bearer\s+[A-Za-z0-9._-]+') { throw 'Potential plaintext credential: redact/export clean artifact locally; do not upload' }
 }
}
$target=Assert-Contained $root (Join-Path $root ("evidence\native-run-"+(Get-Date -Format 'yyyyMMddTHHmmss')+"-$RunId"))
if (Test-Path -LiteralPath $target) { throw 'Refusing overwrite' }
New-Item -ItemType Directory -Path $target | Out-Null
$items=@()
function Copy-Recorded([string]$From,[string]$Relative) {
 $to=Join-Path $target $Relative
 New-Item -ItemType Directory -Path (Split-Path -Parent $to) -Force | Out-Null
 $before=Get-FileHash -LiteralPath $From -Algorithm SHA256
 Copy-Item -LiteralPath $From -Destination $to
 $after=Get-FileHash -LiteralPath $From -Algorithm SHA256
 $copy=Get-FileHash -LiteralPath $to -Algorithm SHA256
 if ($before.Hash -ne $after.Hash -or $copy.Hash -ne $before.Hash) { throw 'Source changed during collection; incomplete package' }
 $f=Get-Item -LiteralPath $From
 return @{path=$Relative.Replace('\','/');sha256=$copy.Hash.ToLowerInvariant();size=$f.Length;source_mtime_utc=$f.LastWriteTimeUtc.ToString('o')}
}
foreach ($f in $files) { $items+=Copy-Recorded $f.FullName $f.FullName.Substring($source.Length+1) }
$items+=Copy-Recorded (Join-Path $PSScriptRoot $entry.input) 'input/fixture.oblx'
$items+=Copy-Recorded (Join-Path $PSScriptRoot $entry.sidecar) 'input/expected.json'
$mapping=Read-Json (Join-Path $source 'local-mapping.json')
Write-Json (Join-Path $target 'manifest.json') @{schema_version=1;kit_version='mf-native-kit-1';status='UNREVIEWED';native_pass=$false;
 fixture_id=$FixtureId;run_id=$RunId;input_sha256=$entry.sha256;mapping_version=$mapping.mapping_version;collected_at=(Get-Date).ToUniversalTime().ToString('o');
 bazis=$pre.bazis;operator_id=$obs.operator_id;attestor_id=$obs.attestor_id;warnings=$obs.warnings;files=$items;
 signature_attestation='NOT VERIFIED: inventory hashes are not a signature or native approval'}
Write-Output $target
