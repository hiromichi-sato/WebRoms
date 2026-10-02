# Assemble a Git checkout using only Windows PowerShell 5.1.
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$dist = Join-Path $repo 'dist'
New-Item -ItemType Directory -Path $dist -Force | Out-Null
foreach ($name in @('index.html', 'styles.css', 'app.js', 'LICENSE', 'THIRD_PARTY_NOTICES.md')) {
    Copy-Item -LiteralPath (Join-Path $repo $name) -Destination $dist -Force
}
foreach ($name in @('src', 'runtime', 'vendor', 'licenses')) {
    $source = Join-Path $repo $name
    $destination = Join-Path $dist $name
    New-Item -ItemType Directory -Path $destination -Force | Out-Null
    foreach ($entry in Get-ChildItem -LiteralPath $source) {
        Copy-Item -LiteralPath $entry.FullName -Destination $destination -Recurse -Force
    }
}
$files = [ordered]@{}
foreach ($file in Get-ChildItem -LiteralPath $dist -Recurse -File) {
    $name = $file.FullName.Substring($dist.Length + 1).Replace('\', '/')
    if ($name -eq 'asset-manifest.json') { continue }
    $algorithm = [Security.Cryptography.SHA256]::Create()
    $stream = [IO.File]::OpenRead($file.FullName)
    try { $files[$name] = [BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
    finally { $stream.Dispose(); $algorithm.Dispose() }
}
$manifest = @{ version = 1; files = $files } | ConvertTo-Json -Depth 3
[IO.File]::WriteAllText((Join-Path $dist 'asset-manifest.json'), $manifest, (New-Object Text.UTF8Encoding($false)))
