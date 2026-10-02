# Windows PowerShell 5.1; no external runtime or administrator rights required.
param([int]$Port = 5176, [switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'dist'))
$prefix = $root + [IO.Path]::DirectorySeparatorChar
foreach ($file in @('index.html', 'app.js', 'asset-manifest.json', 'vendor/lucide.js', 'vendor/three/three.module.js', 'vendor/three/three.core.js', 'vendor/three/addons/controls/OrbitControls.js', 'runtime/roms-worker.js', 'runtime/roms.js', 'runtime/roms.wasm', 'runtime/npzd/roms.js', 'runtime/npzd/roms.wasm', 'runtime/nemuro/roms.js', 'runtime/nemuro/roms.wasm', 'runtime/manifest.json')) {
    if (-not [IO.File]::Exists((Join-Path $root $file))) {
        Write-Host "Missing application file: dist/$file"
        Write-Host 'Extract the complete WebROMS-windows.zip. Source-code ZIPs require a developer build; see WINDOWS.md.'
        exit 1
    }
}
try {
    $manifest = Get-Content -LiteralPath (Join-Path $root 'asset-manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($manifest.version -ne 1 -or -not $manifest.files) { throw 'Invalid asset manifest.' }
    foreach ($asset in $manifest.files.PSObject.Properties) {
        $target = [IO.Path]::GetFullPath((Join-Path $root $asset.Name))
        if (-not $target.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid asset path.' }
        if (-not [IO.File]::Exists($target)) { throw "Missing application file: dist/$($asset.Name)" }
        $algorithm = [Security.Cryptography.SHA256]::Create()
        $source = [IO.File]::OpenRead($target)
        try { $hash = [BitConverter]::ToString($algorithm.ComputeHash($source)).Replace('-', '') }
        finally { $source.Dispose(); $algorithm.Dispose() }
        if ($hash -ne $asset.Value) { throw "Damaged application file: dist/$($asset.Name)" }
    }
} catch {
    Write-Host $_.Exception.Message
    Write-Host 'Download and extract the complete WebROMS-windows.zip again. See WINDOWS.md.'
    exit 1
}
if ($Port -lt 1024 -or $Port -gt 65400) { throw 'Port must be between 1024 and 65400.' }
$listener = $null
for ($candidate = $Port; $candidate -lt $Port + 30; $candidate++) {
    $attempt = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, $candidate)
    try { $attempt.Start(); $listener = $attempt; $Port = $candidate; break }
    catch { $attempt.Stop() }
}
if (-not $listener) { throw 'No available local port. Close an earlier WebROMS window and try again.' }
$url = "http://127.0.0.1:$Port/"
Write-Host "WebROMS: $url"
Write-Host 'Keep this window open. Close it or press Ctrl+C to stop.'
Write-Host 'If the browser does not open, paste the URL into Microsoft Edge or Chrome.'
if (-not $NoBrowser) {
    try { Start-Process $url } catch { Write-Host 'Automatic browser launch failed; open the URL manually.' }
}
$mime = @{ '.html'='text/html; charset=utf-8'; '.js'='text/javascript; charset=utf-8'; '.css'='text/css; charset=utf-8'; '.wasm'='application/wasm'; '.json'='application/json'; '.svg'='image/svg+xml'; '.png'='image/png'; '.txt'='text/plain; charset=utf-8' }
try {
    while ($true) {
        if (-not $listener.Pending()) { Start-Sleep -Milliseconds 20; continue }
        $client = $listener.AcceptTcpClient()
        $stream = $null; $reader = $null; $inputFile = $null
        try {
            $client.ReceiveTimeout = 3000; $client.SendTimeout = 15000
            $stream = $client.GetStream()
            $reader = New-Object IO.StreamReader($stream, [Text.Encoding]::ASCII, $false, 1024, $true)
            $line = $reader.ReadLine()
            if (-not $line -or $line.Length -gt 8192) { continue }
            $parts = $line.Split(' ')
            if ($parts.Length -ne 3) { continue }
            $headerSize = 0
            do {
                $header = $reader.ReadLine(); $headerSize += $header.Length
                if ($headerSize -gt 32768) { throw 'Request headers too large.' }
            } while ($header)
            $status = '200 OK'; $message = ''; $type = 'text/plain; charset=utf-8'
            if ($parts[0] -notin @('GET', 'HEAD')) { $status = '405 Method Not Allowed'; $message = 'GET and HEAD only.' }
            else {
                $requestPath = [Uri]::UnescapeDataString(($parts[1] -split '\?', 2)[0])
                if ($requestPath -eq '/') { $requestPath = '/index.html' }
                $target = [IO.Path]::GetFullPath((Join-Path $root $requestPath.TrimStart('/')))
                if (-not $target.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase) -or $requestPath.Contains('\') -or $requestPath.Contains(':')) {
                    $status = '403 Forbidden'; $message = 'Outside application directory.'
                } elseif (-not [IO.File]::Exists($target)) { $status = '404 Not Found'; $message = 'File not found.' }
                else {
                    $inputFile = [IO.File]::OpenRead($target)
                    $extension = [IO.Path]::GetExtension($target).ToLowerInvariant()
                    $type = $mime[$extension]; if (-not $type) { $type = 'application/octet-stream' }
                }
            }
            $body = [Text.Encoding]::UTF8.GetBytes($message)
            $length = $body.Length; if ($inputFile) { $length = $inputFile.Length }
            $response = "HTTP/1.1 $status`r`nContent-Type: $type`r`nContent-Length: $length`r`nCache-Control: no-cache`r`nX-Content-Type-Options: nosniff`r`nConnection: close`r`n`r`n"
            $bytes = [Text.Encoding]::ASCII.GetBytes($response); $stream.Write($bytes, 0, $bytes.Length)
            if ($parts[0] -ne 'HEAD') {
                if ($inputFile) { $inputFile.CopyTo($stream) } else { $stream.Write($body, 0, $body.Length) }
            }
            $stream.Flush()
        } catch { Write-Verbose $_.Exception.Message }
        finally {
            if ($inputFile) { $inputFile.Dispose() }
            if ($reader) { $reader.Dispose() }
            if ($stream) { $stream.Dispose() }
            $client.Close()
        }
    }
} finally { $listener.Stop() }
