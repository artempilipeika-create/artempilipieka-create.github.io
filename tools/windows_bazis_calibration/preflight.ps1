# Read-only. JSON to stdout; redirect into a NEW file yourself. Never launches BAZIS.
param(
 [Parameter(Mandatory=$true)][string]$TestRoot,
 [Parameter(Mandatory=$true)][string]$BazisExe,
 [Parameter(Mandatory=$true)][string]$IsolationReview
)
. "$PSScriptRoot\common.ps1"
$root = Assert-SafePath $TestRoot
if (-not (Test-Path -LiteralPath $root -PathType Container)) { throw 'Explicit test root must already exist' }
# Executable may legitimately be in Program Files, but never inspect D:\pgm or a link.
$exe = [IO.Path]::GetFullPath($BazisExe)
if ($exe -notmatch '^[A-Za-z]:\\' -or $exe -match '(?i)(^|\\)pgm(\\|$)') { throw 'Production executable path forbidden' }
$walk=$exe
while ($walk) {
 if ((Test-Path -LiteralPath $walk) -and ((Get-Item -LiteralPath $walk -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Executable reparse path forbidden' }
 $parent=Split-Path -Parent $walk; if ($parent -eq $walk) { break }; $walk=$parent
}
$item = Get-Item -LiteralPath $exe
if ($item.PSIsContainer -or $item.Extension -ine '.exe') { throw 'Select exact installed BAZIS executable' }
$reviewPath=Assert-Contained $root $IsolationReview
$review=Read-Json $reviewPath
$fail=[Collections.Generic.List[string]]::new()
if ($review.test_root -ine $root -or -not $review.reviewer_id -or -not $review.reviewed_at) { $fail.Add('Missing exact root/operator review') }
foreach ($flag in @('dedicated_test_root','no_production_data','no_production_agent','no_machine_connection','no_sync_or_watcher_access','reviewed_process_service_task_inventory')) {
 if ($review.$flag -ne $true) { $fail.Add("Isolation review not confirmed: $flag") }
}
$dirs=@{}
foreach ($name in @('inbox','work','outbox','archive','failed','evidence')) {
 $path=Assert-Contained $root (Join-Path $root $name); $dirs[$name]=$path
 if (-not (Test-Path -LiteralPath $path -PathType Container)) { $fail.Add("Missing test directory: $name") }
}
# Examine routing locally; emit ONLY names/IDs/reasons, never command lines or credentials.
$inventory=@(); $bazis=@(); $pattern='(?i)resilio|syncthing|site.?sync|import.?manager|linker|watch|agent|sync|python|wscript|cscript|node|powershell|pwsh'
try {
 $processes=@(Get-CimInstance Win32_Process)
 foreach ($p in $processes) {
  if ($p.ProcessId -eq $PID) { continue }
  $combined="$($p.Name) $($p.ExecutablePath) $($p.CommandLine)"
  $matchesRoot=$combined.IndexOf($root,[StringComparison]::OrdinalIgnoreCase) -ge 0
  if ($p.Name -match '(?i)bazis|basis|базис' -or $p.ExecutablePath -ieq $exe) { $bazis+=@{name=$p.Name;pid=$p.ProcessId}; $fail.Add('Existing BAZIS process: isolation/session ambiguity') }
  $suspicious=$matchesRoot -or ($combined -match $pattern)
  $inventory+=@{kind='process';name=$p.Name;id=$p.ProcessId;potential_watcher=$suspicious}
  if ($suspicious) { $fail.Add('Potential process watcher; manual isolation required') }
 }
 foreach ($s in @(Get-CimInstance Win32_Service)) {
  $combined="$($s.Name) $($s.DisplayName) $($s.PathName)"
  $suspicious=($combined -match $pattern) -or ($combined.IndexOf($root,[StringComparison]::OrdinalIgnoreCase) -ge 0)
  $inventory+=@{kind='service';name=$s.Name;state=$s.State;potential_watcher=$suspicious}
  if ($suspicious -and $s.StartMode -ne 'Disabled') { $fail.Add('Potential enabled service watcher') }
 }
 foreach ($t in @(Get-ScheduledTask)) {
  $actions=($t.Actions | ForEach-Object { "$($_.Execute) $($_.Arguments) $($_.WorkingDirectory)" }) -join ' '
  $suspicious=("$($t.TaskName) $actions" -match $pattern) -or ($actions.IndexOf($root,[StringComparison]::OrdinalIgnoreCase) -ge 0)
  $inventory+=@{kind='task';name=$t.TaskName;state=[string]$t.State;potential_watcher=$suspicious}
  if ($suspicious -and [string]$t.State -ne 'Disabled') { $fail.Add('Potential enabled task watcher') }
 }
} catch { $fail.Add('Process/service/task inventory incomplete: review locally; no bypass') }
$drive=Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$($root.Substring(0,2))'"
if (-not $drive -or $drive.FreeSpace -lt 2GB) { $fail.Add('Less than 2 GiB free or free space unknown') }
$os=Get-CimInstance Win32_OperatingSystem
$bytes=[Text.Encoding]::UTF8.GetBytes('mf-calibration-v1|'+$env:COMPUTERNAME)
$machine=([BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash($bytes))).Replace('-','').ToLowerInvariant().Substring(0,24)
$hash=$null
if ($item.Length -le 2GB) { $hash=(Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash.ToLowerInvariant() } else { $fail.Add('Executable hash deferred: >2GiB; review required') }
if (-not $item.VersionInfo.FileVersion -or -not $item.VersionInfo.ProductVersion) { $fail.Add('Executable version missing') }
@{schema_version=1;status=$(if($fail.Count){'PRECHECK FAIL'}else{'PRECHECK CLEAR FOR MANUAL REVIEW'});native_pass=$false;
 checked_at=(Get-Date).ToUniversalTime().ToString('o');local_time=(Get-Date).ToString('o');timezone=(Get-TimeZone).Id;
 machine_id=$machine;windows=@{version=$os.Version;build=$os.BuildNumber};test_root=$root;directories=$dirs;
 bazis=@{executable=$exe;file_version=$item.VersionInfo.FileVersion;product_version=$item.VersionInfo.ProductVersion;sha256=$hash};
 running_bazis=$bazis;free_bytes=$drive.FreeSpace;inventory=$inventory;failures=@($fail);
 isolation_review_sha256=(Get-FileHash -LiteralPath $reviewPath -Algorithm SHA256).Hash.ToLowerInvariant();
 limits='Heuristics cannot prove watcher absence. Human review of all inventories, ACL/share/sync routing and exact selected executable is mandatory.'
} | ConvertTo-Json -Depth 12
