$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$output = Join-Path $repo 'releases'
$stage = Join-Path $output ('stage-' + [Guid]::NewGuid().ToString('N'))
$bundle = Join-Path $stage 'WebROMS'
New-Item -ItemType Directory -Path $bundle -Force | Out-Null
if (-not (Test-Path -LiteralPath (Join-Path $repo 'dist/runtime/roms.wasm'))) { throw 'Run the build before packaging.' }
Copy-Item -LiteralPath (Join-Path $repo 'dist') -Destination $bundle -Recurse
foreach ($name in @('start-webroms.bat', 'start-webroms.ps1', 'WINDOWS.md', 'README.md')) {
    Copy-Item -LiteralPath (Join-Path $repo $name) -Destination $bundle
}
$archive = Join-Path $output 'WebROMS-windows.zip'
Add-Type -AssemblyName System.IO.Compression
$zipStream = [IO.File]::Open($archive, [IO.FileMode]::Create, [IO.FileAccess]::Write, [IO.FileShare]::Read)
$zip = New-Object IO.Compression.ZipArchive($zipStream, [IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($file in Get-ChildItem -LiteralPath $bundle -Recurse -File) {
        $name = $file.FullName.Substring($stage.Length + 1).Replace('\', '/')
        $entry = $zip.CreateEntry($name, [IO.Compression.CompressionLevel]::Optimal)
        $source = [IO.File]::Open($file.FullName, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
        $destination = $entry.Open()
        try { $source.CopyTo($destination) } finally { $source.Dispose(); $destination.Dispose() }
    }
} finally { $zip.Dispose(); $zipStream.Dispose() }
$hash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText($archive + '.sha256', "$hash  WebROMS-windows.zip`n", [Text.Encoding]::ASCII)
Write-Host "Windows package: $archive"
