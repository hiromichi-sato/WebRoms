# Windows PowerShell 5.1; no external runtime or administrator rights required.
param([int]$Port = 5176, [switch]$NoBrowser, [switch]$AutoExit)
$ErrorActionPreference = 'Stop'
$appRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Write-Host 'WEBROMS_STAGE:prepare'
# Source checkouts include the assembler; release ZIPs already contain dist.
$prepare = Join-Path $appRoot 'scripts/prepare-windows.ps1'
if (Test-Path -LiteralPath $prepare) {
    Write-Host 'Preparing WebROMS from source...'
    try { & $prepare }
    catch {
        Write-Host $_.Exception.Message
        Write-Host 'Could not prepare application files. Keep the complete checkout together in a writable folder.'
        exit 1
    }
}
$root = [IO.Path]::GetFullPath((Join-Path $appRoot 'dist'))
$prefix = $root + [IO.Path]::DirectorySeparatorChar
foreach ($file in @('index.html', 'app.js', 'asset-manifest.json', 'vendor/lucide.js', 'vendor/three/three.module.js', 'vendor/three/three.core.js', 'vendor/three/addons/controls/OrbitControls.js', 'runtime/roms-worker.js', 'runtime/roms.js', 'runtime/roms.wasm', 'runtime/npzd/roms.js', 'runtime/npzd/roms.wasm', 'runtime/nemuro/roms.js', 'runtime/nemuro/roms.wasm', 'runtime/manifest.json')) {
    if (-not [IO.File]::Exists((Join-Path $root $file))) {
        Write-Host "Missing application file: dist/$file"
        Write-Host 'Get the complete Git checkout again. Keep all application files together. See WINDOWS.md.'
        exit 1
    }
}
Write-Host 'WEBROMS_STAGE:verify'
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
    Write-Host 'Get the complete Git checkout again. See WINDOWS.md.'
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
$managedSession = -not $NoBrowser -or $AutoExit
$sessionToken = [Guid]::NewGuid().ToString('N')
$sessions = @{}
$idleSince = [DateTime]::UtcNow
$connected = $false
if ($managedSession) { $url += "?desktopSession=$sessionToken" }
Write-Host "WebROMS: $url"
if ($managedSession) { Write-Host 'Close the last WebROMS tab to stop the application.' }
else { Write-Host 'Headless server: press Ctrl+C to stop.' }
if (-not $NoBrowser) {
    try { Start-Process $url } catch { $listener.Stop(); throw 'Automatic browser launch failed. Check the default browser in Windows Settings.' }
}
$mime = @{ '.html'='text/html; charset=utf-8'; '.js'='text/javascript; charset=utf-8'; '.css'='text/css; charset=utf-8'; '.wasm'='application/wasm'; '.json'='application/json'; '.svg'='image/svg+xml'; '.png'='image/png'; '.txt'='text/plain; charset=utf-8' }
Add-Type -AssemblyName System.Net.Http
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$etopoClient = New-Object Net.Http.HttpClient
$etopoClient.Timeout = [TimeSpan]::FromSeconds(45)
$etopoCache = [ordered]@{}
try {
    while ($true) {
        if ($managedSession) {
            $now = [DateTime]::UtcNow
            foreach ($id in @($sessions.Keys)) {
                if (($now - $sessions[$id]).TotalMinutes -gt 20) { $sessions.Remove($id) }
            }
            if ($sessions.Count) { $idleSince = $now }
            elseif (($now - $idleSince).TotalSeconds -gt $(if ($connected) { 10 } else { 120 })) { break }
        }
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
            $status = '200 OK'; $message = ''; $type = 'text/plain; charset=utf-8'; $proxyBody = $null
            $sessionPath = '^/__webroms_session/' + $sessionToken + '/([a-f0-9-]{36})/(open|ping|close)$'
            if ($managedSession -and $parts[1] -match $sessionPath -and $parts[0] -in @('GET', 'POST')) {
                $id = $Matches[1]; $action = $Matches[2]
                if ($action -eq 'close') { $sessions.Remove($id) }
                else {
                    $sessions[$id] = [DateTime]::UtcNow
                    if (-not $connected) { Write-Host 'WEBROMS_READY' }
                    $connected = $true
                }
                $idleSince = [DateTime]::UtcNow
                $message = 'OK'
            }
            elseif ($parts[1].StartsWith('/__webroms_etopo')) {
                try {
                    if ($parts[0] -ne 'GET' -or $parts[1] -notmatch '^/__webroms_etopo\?y0=(\d+)&y1=(\d+)&x0=(\d+)&x1=(\d+)&stride=(\d+)$') { throw 'Invalid ETOPO request.' }
                    $y0 = [int]$Matches[1]; $y1 = [int]$Matches[2]; $x0 = [int]$Matches[3]; $x1 = [int]$Matches[4]; $stride = [int]$Matches[5]
                    if ($stride -lt 1 -or $stride -gt 1000 -or $y0 -lt 0 -or $y1 -gt 43199 -or $x0 -lt 0 -or $x1 -gt 86399 -or $y1 -le $y0 -or $x1 -le $x0) { throw 'Invalid ETOPO indices.' }
                    $count = ([Math]::Floor(($y1-$y0)/$stride)+1) * ([Math]::Floor(($x1-$x0)/$stride)+1)
                    if ($count -gt 400000) { throw 'ETOPO request exceeds limits.' }
                    $upstream = 'https://oceanwatch.pifsc.noaa.gov/erddap/griddap/ETOPO_2022_v1_15s.json?z[' + $y0 + ':' + $stride + ':' + $y1 + '][' + $x0 + ':' + $stride + ':' + $x1 + ']'
                    if ($etopoCache.Contains($upstream)) { $proxyBody = $etopoCache[$upstream] }
                    else {
                        $remote = $etopoClient.GetAsync($upstream).GetAwaiter().GetResult()
                        try {
                            if (-not $remote.IsSuccessStatusCode) { throw ('NOAA HTTP ' + [int]$remote.StatusCode) }
                            if ($remote.Content.Headers.ContentLength -gt 48000000) { throw 'ETOPO response too large.' }
                            $proxyBody = $remote.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()
                            if ($proxyBody.Length -gt 48000000) { throw 'ETOPO response too large.' }
                        } finally { $remote.Dispose() }
                        if ($etopoCache.Count -ge 2) { $etopoCache.Remove(@($etopoCache.Keys)[0]) }
                        $etopoCache[$upstream] = $proxyBody
                    }
                    $type = 'application/json; charset=utf-8'
                } catch { $status = '502 Bad Gateway'; $message = $_.Exception.Message; $proxyBody = $null }
            }
            elseif ($parts[0] -notin @('GET', 'HEAD')) { $status = '405 Method Not Allowed'; $message = 'GET and HEAD only.' }
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
            if ($null -ne $proxyBody) { $body = $proxyBody }
            $length = $body.Length; if ($inputFile) { $length = $inputFile.Length }
            $response = "HTTP/1.1 $status`r`nContent-Type: $type`r`nContent-Length: $length`r`nCache-Control: no-cache`r`nX-Content-Type-Options: nosniff`r`nCross-Origin-Opener-Policy: same-origin`r`nCross-Origin-Embedder-Policy: require-corp`r`nConnection: close`r`n`r`n"
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
} finally { $etopoClient.Dispose(); $listener.Stop() }
