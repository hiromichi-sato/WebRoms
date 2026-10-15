# Windows-only maintenance task. Users run the already-built launcher.
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$assets = Join-Path $repo 'assets'
New-Item -ItemType Directory -Path $assets -Force | Out-Null
Add-Type -AssemblyName System.Drawing
$images = @()
foreach ($size in @(16, 32, 48, 256)) {
    $bitmap = New-Object Drawing.Bitmap($size, $size)
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.ScaleTransform(($size / 256.0), ($size / 256.0))
    $background = New-Object Drawing.SolidBrush([Drawing.Color]::FromArgb(255, 16, 112, 109))
    $white = New-Object Drawing.Pen([Drawing.Color]::White, 13)
    $white.StartCap = $white.EndCap = [Drawing.Drawing2D.LineCap]::Round
    $play = New-Object Drawing.SolidBrush([Drawing.Color]::FromArgb(255, 252, 216, 91))
    try {
        $graphics.FillEllipse($background, 4, 4, 248, 248)
        foreach ($y in @(82, 124, 166)) {
            $graphics.DrawBezier($white, 43, $y, 63, ($y - 22), 81, ($y + 22), 103, $y)
            $graphics.DrawBezier($white, 103, $y, 125, ($y - 22), 143, ($y + 22), 163, $y)
        }
        $graphics.FillPolygon($play, [Drawing.PointF[]]@([Drawing.PointF]::new(182, 94), [Drawing.PointF]::new(224, 124), [Drawing.PointF]::new(182, 154)))
        $memory = New-Object IO.MemoryStream
        try { $bitmap.Save($memory, [Drawing.Imaging.ImageFormat]::Png); $images += ,@($size, $memory.ToArray()) } finally { $memory.Dispose() }
    } finally { $background.Dispose(); $white.Dispose(); $play.Dispose(); $graphics.Dispose(); $bitmap.Dispose() }
}
$icon = Join-Path $assets 'webroms.ico'
$stream = [IO.File]::Create($icon)
$writer = New-Object IO.BinaryWriter($stream)
try {
    $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$images.Count)
    $offset = 6 + 16 * $images.Count
    foreach ($image in $images) {
        $dimension = if ($image[0] -eq 256) { 0 } else { $image[0] }
        $writer.Write([byte]$dimension); $writer.Write([byte]$dimension); $writer.Write([byte]0); $writer.Write([byte]0)
        $writer.Write([uint16]1); $writer.Write([uint16]32); $writer.Write([uint32]$image[1].Length); $writer.Write([uint32]$offset)
        $offset += $image[1].Length
    }
    foreach ($image in $images) { $writer.Write([byte[]]$image[1]) }
} finally { $writer.Dispose(); $stream.Dispose() }
$compiler = Join-Path $env:SystemRoot 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) { $compiler = Join-Path $env:SystemRoot 'Microsoft.NET/Framework/v4.0.30319/csc.exe' }
if (-not (Test-Path -LiteralPath $compiler)) { throw 'Windows .NET Framework C# compiler not found.' }
$name = '00_WebROMS' + [char]0x3092 + [char]0x8d77 + [char]0x52d5 + '.exe'
$output = Join-Path $repo $name
& $compiler /nologo /target:winexe /optimize+ /platform:anycpu "/win32icon:$icon" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll "/out:$output" (Join-Path $PSScriptRoot 'windows-launcher/Launcher.cs')
if ($LASTEXITCODE -ne 0) { throw 'Launcher compilation failed.' }
Write-Host "Launcher: $output"
