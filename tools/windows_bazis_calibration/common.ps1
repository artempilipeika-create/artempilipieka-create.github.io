Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
function Assert-SafePath([string]$Path) {
    if ($env:OS -ne 'Windows_NT') { throw 'Windows only; no emulation' }
    if ($Path -notmatch '^[A-Za-z]:\\' -or $Path -match '(?i)(^|[\\/])(pgm|Windows|Program Files(?: \(x86\))?|ProgramData|Users|Resilio|OneDrive|Dropbox)([\\/]|$)') { throw 'Unsafe, shared, system or production path' }
    $full = [IO.Path]::GetFullPath($Path).TrimEnd('\')
    if ($full.Length -le 3) { throw 'Drive root forbidden' }
    $cur = $full
    while ($cur) {
        if (Test-Path -LiteralPath $cur) {
            $item = Get-Item -LiteralPath $cur -Force
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Reparse point forbidden' }
        }
        $parent = Split-Path -Parent $cur
        if ($parent -eq $cur) { break }; $cur = $parent
    }
    return $full
}
function Assert-Contained([string]$Root,[string]$Path) {
    $full = Assert-SafePath $Path
    if (-not $full.StartsWith($Root.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Path outside explicit test root' }
    return $full
}
function Read-Json([string]$Path) { return Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json }
function Write-Json([string]$Path,$Value) {
    if (Test-Path -LiteralPath $Path) { throw 'Refusing overwrite' }
    [IO.File]::WriteAllText($Path,($Value | ConvertTo-Json -Depth 40),[Text.UTF8Encoding]::new($false))
}
function Get-SafeFiles([string]$Directory) {
    foreach ($item in Get-ChildItem -LiteralPath $Directory -Force) {
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Reparse entry forbidden' }
        if ($item.PSIsContainer) { Get-SafeFiles $item.FullName } else { $item }
    }
}
