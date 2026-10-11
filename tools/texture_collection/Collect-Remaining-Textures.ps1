$ErrorActionPreference = 'Stop'
try {
Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$root = [IO.Path]::GetFullPath($env:MF_TEXTURE_SOURCE).TrimEnd([char]92)
if (-not (Test-Path -LiteralPath $root -PathType Container)) { throw ('Folder not found: ' + $root) }
$known = @{}
$plan = Get-Content -LiteralPath $env:MF_TEXTURE_PLAN -Raw -Encoding UTF8 | ConvertFrom-Json
foreach ($p in $plan.received) { $known[$p.relative_path] = $p.sha256 }
$desktop = [Environment]::GetFolderPath('Desktop')
if (-not $desktop) { throw 'Desktop folder not found' }
$dest = Join-Path $desktop ('MF_All_Textures_' + (Get-Date -Format 'yyyyMMdd_HHmmss') + '_' + [guid]::NewGuid().ToString('N').Substring(0,6))
$null = New-Item -Path $dest -ItemType Directory
$script:part = 0; $script:zip = $null; $script:records = $null; $script:partBytes = 0
$packed = 0; $skipped = 0; $errors = 0; $seen = 0
function Start-Pack {
$script:part++; $script:partBytes = 0; $script:entries = @{}; $script:records = New-Object 'System.Collections.Generic.List[object]'
$script:temp = Join-Path $dest ('MF_All_Textures_' + $script:part.ToString('00') + '.partial')
$script:stream = [IO.File]::Open($script:temp,[IO.FileMode]::CreateNew)
$script:zip = New-Object System.IO.Compression.ZipArchive($script:stream,[IO.Compression.ZipArchiveMode]::Create,$false)
}
function Close-Pack {
if ($script:zip) {
$m = [ordered]@{schema='mf-texture-preview-images-v2';part=$script:part;source_folder=$root;created_at=(Get-Date).ToString('o');files=@($script:records.ToArray())}
$e = $script:zip.CreateEntry('manifest.json'); $w = New-Object IO.StreamWriter($e.Open(),(New-Object Text.UTF8Encoding($false)))
try { $w.Write(($m | ConvertTo-Json -Depth 8)) } finally { $w.Dispose() }
$script:zip.Dispose(); $script:zip = $null; $script:stream.Dispose()
Move-Item -LiteralPath $script:temp -Destination ([IO.Path]::ChangeExtension($script:temp,'.zip'))
}
}
Start-Pack
$scanErrors = @()
$files = @(Get-ChildItem -LiteralPath $root -Recurse -File -ErrorAction SilentlyContinue -ErrorVariable +scanErrors | Where-Object { $_.Extension.ToLowerInvariant() -in '.jpg','.jpeg','.png','.tif','.tiff','.bmp','.webp','.gif' })
foreach ($f in $files) {
$seen++; $rel = $f.FullName.Substring($root.Length + 1)
$rec = [ordered]@{source_relative_path=$rel;expected_size_bytes=$f.Length;source_sha256=$null;status='error';archive_path=$null;sha256=$null;representation=$null;error=$null}
try {
if (-not $f.FullName.StartsWith($root + [char]92,[StringComparison]::OrdinalIgnoreCase)) { throw 'File outside source folder' }
$hash = (Get-FileHash -LiteralPath $f.FullName -Algorithm SHA256).Hash.ToLowerInvariant(); $rec.source_sha256 = $hash
if ($known.ContainsKey($rel) -and $known[$rel] -eq $hash) { $rec.status = 'already_received'; $skipped++ } else {
$extension = $f.Extension.ToLowerInvariant()
if ($extension -eq '.webp' -and $f.Length -le 50331648) {
$bytes = [IO.File]::ReadAllBytes($f.FullName); $rec.representation = 'original'
} else {
$inStream = [IO.File]::OpenRead($f.FullName)
try {
$decoder = [Windows.Media.Imaging.BitmapDecoder]::Create($inStream,[Windows.Media.Imaging.BitmapCreateOptions]::DelayCreation,[Windows.Media.Imaging.BitmapCacheOption]::OnDemand)
$width = $decoder.Frames[0].PixelWidth; $height = $decoder.Frames[0].PixelHeight
$rec.source_width = $width; $rec.source_height = $height; $rec.source_frames = $decoder.Frames.Count
$inStream.Position = 0
$bitmap = New-Object Windows.Media.Imaging.BitmapImage
$bitmap.BeginInit(); $bitmap.CacheOption = [Windows.Media.Imaging.BitmapCacheOption]::OnLoad; $bitmap.StreamSource = $inStream
if ([Math]::Max($width,$height) -gt 2048) { if ($width -ge $height) { $bitmap.DecodePixelWidth = 2048 } else { $bitmap.DecodePixelHeight = 2048 } }
$bitmap.EndInit(); $bitmap.Freeze()
} finally { $inStream.Dispose() }
$extension = $f.Extension.ToLowerInvariant()
if ($extension -in '.jpg','.jpeg','.png' -and [Math]::Max($width,$height) -le 2048 -and $f.Length -le 2097152) {
$bytes = [IO.File]::ReadAllBytes($f.FullName); $rec.representation = 'original'
} else {
$extension = '.jpg'; $encoder = New-Object Windows.Media.Imaging.JpegBitmapEncoder; $encoder.QualityLevel = 92
if ($f.Extension.ToLowerInvariant() -eq '.png' -or $bitmap.Format.ToString() -match 'Bgra|Pbgra|Rgba|Prgba') { $extension = '.png'; $encoder = New-Object Windows.Media.Imaging.PngBitmapEncoder }
$encoder.Frames.Add([Windows.Media.Imaging.BitmapFrame]::Create($bitmap))
$memory = New-Object IO.MemoryStream
try { $encoder.Save($memory); $bytes = $memory.ToArray() } finally { $memory.Dispose() }
$rec.representation = 'web_preview_2048'; $rec.preview_width = $bitmap.PixelWidth; $rec.preview_height = $bitmap.PixelHeight
}
}
$current = Get-Item -LiteralPath $f.FullName
if ($current.Length -ne $f.Length -or $current.LastWriteTimeUtc -ne $f.LastWriteTimeUtc) { throw 'Source changed while reading; run the collector again' }
if ($script:partBytes -gt 0 -and $script:partBytes + $bytes.Length -gt 50331648) { Close-Pack; Start-Pack }
$entryName = 'textures/' + $hash + $extension
if (-not $script:entries.ContainsKey($entryName)) {
$e = $script:zip.CreateEntry($entryName,[IO.Compression.CompressionLevel]::NoCompression); $out = $e.Open()
try { $out.Write($bytes,0,$bytes.Length) } finally { $out.Dispose() }
$script:entries[$entryName] = $true; $script:partBytes += $bytes.Length
}
$sha = [Security.Cryptography.SHA256]::Create()
try { $rec.sha256 = [BitConverter]::ToString($sha.ComputeHash($bytes)).Replace('-','').ToLowerInvariant() } finally { $sha.Dispose() }
$rec.status = 'packed'; $rec.archive_path = $entryName; $rec.preview_bytes = $bytes.Length; $packed++
$bytes = $null; $bitmap = $null; $decoder = $null; $encoder = $null
}
} catch { $rec.error = $_.Exception.Message; $errors++ }
$script:records.Add([pscustomobject]$rec)
Write-Progress -Activity 'Preparing remaining textures' -Status ($seen.ToString() + ' / ' + $files.Count) -PercentComplete (100 * $seen / [Math]::Max(1,$files.Count))
if ($f.Length -gt 50331648 -or $seen -eq 20 * [Math]::Floor($seen / 20)) { [GC]::Collect() }
}
Close-Pack
$summary = [ordered]@{schema='mf-texture-preview-summary-v2';scanned_files=$files.Count;packed=$packed;already_received=$skipped;file_errors=$errors;scan_errors=@($scanErrors | ForEach-Object { $_.Exception.Message });parts=$script:part;source_unchanged=$true}
$summary | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $dest 'summary.json') -Encoding UTF8
Write-Progress -Activity 'Preparing remaining textures' -Completed
Write-Host ('Packed: ' + $packed + '; already received: ' + $skipped + '; errors: ' + $errors)
Write-Host 'Send all MF_All_Textures_*.zip files and summary.json from:' -ForegroundColor Green
Write-Host $dest
if ($errors -or $scanErrors.Count) { Write-Host 'Some files need review. Send the generated files; errors are recorded.' -ForegroundColor Yellow }
exit 0
} catch {
if ($script:zip) { $script:zip.Dispose() }
Write-Host $_.Exception.Message -ForegroundColor Red
exit 1
}
