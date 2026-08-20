# Bildschirmfoto plus Texterkennung ueber die Windows-eigene OCR.
#
# WARUM WINDOWS-OCR:
#   Windows.Media.Ocr steckt seit Windows 10 im System. Kein npm-Paket, keine
#   15 MB Sprachmodell, kein Nachladen aus dem Netz - und die Erkennung laeuft
#   offline. Die Alternative waere tesseract.js gewesen.
#
# AUSGABE:
#   PNG des Ausschnitts und daneben eine JSON-Datei mit erkanntem Text UND den
#   Wortkoordinaten. Die Koordinaten sind der eigentliche Gewinn: auf dem
#   Belohnungsbildschirm stehen vier Namen nebeneinander, und nur ueber die
#   Position laesst sich zuordnen, welches Wort zu welchem Item gehoert.
#
# Aufruf:
#   powershell -ExecutionPolicy Bypass -File tools/ocr-capture.ps1 `
#              -Png data/ocr/shot.png -Json data/ocr/shot.json [-X 0 -Y 0 -W 0 -H 0]
#   X/Y/W/H leer oder 0 bedeutet: ganzer Hauptbildschirm.

param(
  [Parameter(Mandatory = $true)][string]$Png,
  [Parameter(Mandatory = $true)][string]$Json,
  [int]$X = 0, [int]$Y = 0, [int]$W = 0, [int]$H = 0,
  # Vorhandenes Bild auswerten, statt den Bildschirm aufzunehmen. Fuer Tests
  # ohne laufendes Spiel - und um eine Erkennung spaeter nachzustellen.
  [string]$Source = ''
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Runtime.WindowsRuntime

# Set-Content schreibt in Windows PowerShell UTF-8 MIT Byte Order Mark.
# JSON.parse auf der Node-Seite bricht daran ab, deshalb hier ohne BOM.
function Write-JsonFile {
  param(
    [Parameter(ValueFromPipeline = $true)][string]$Text,
    [Parameter(Position = 0)][string]$Path
  )
  process {
    [System.IO.File]::WriteAllText($Path, $Text, (New-Object System.Text.UTF8Encoding $false))
  }
}

# ---------- 1. Ausschnitt bestimmen ----------
$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
if ($W -le 0) { $X = $screen.X; $W = $screen.Width }
if ($H -le 0) { $Y = $screen.Y; $H = $screen.Height }

$dir = Split-Path -Parent $Png
if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }

# ---------- 2. Aufnehmen ----------
if ($Source) {
  Copy-Item -Path $Source -Destination $Png -Force
} else {
  $bmp = New-Object System.Drawing.Bitmap $W, $H
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($X, $Y, 0, 0, (New-Object System.Drawing.Size($W, $H)))
  $bmp.Save($Png, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}

# ---------- 3. Erkennen ----------
# WinRT-Aufrufe sind asynchron; in Windows PowerShell braucht es diesen
# Umweg ueber AsTask, um auf das Ergebnis zu warten.
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
  $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]

function Await($task, $type) {
  $asTask = $asTaskGeneric.MakeGenericMethod($type)
  $netTask = $asTask.Invoke($null, @($task))
  $netTask.Wait(-1) | Out-Null
  $netTask.Result
}

$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Storage.StorageFile, Windows.Foundation, ContentType = WindowsRuntime]

# Bevorzugt Englisch: Warframes Itemnamen sind englisch, und ein deutsches
# Sprachmodell zieht sie in Richtung deutscher Woerter ("Paris" -> "kris").
$engine = $null
try {
  $en = New-Object Windows.Globalization.Language 'en-US'
  $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($en)
} catch { $engine = $null }
if ($null -eq $engine) { $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages() }

if ($null -eq $engine) {
  @{ ok = $false; error = 'Keine OCR-Sprache installiert' } | ConvertTo-Json | Write-JsonFile $Json
  exit 1
}

$file    = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync((Resolve-Path $Png).Path)) ([Windows.Storage.StorageFile])
$stream  = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
$decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
$bitmap  = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
$result  = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])

# ---------- 4. Ergebnis ----------
$lines = @()
foreach ($line in $result.Lines) {
  $words = @()
  # Bewusst $word und nicht $w: PowerShell unterscheidet keine Gross- und
  # Kleinschreibung, $w waere derselbe Name wie der Parameter [int]$W - und
  # der Versuch, ein OcrWord dort hineinzuschreiben, bricht das Skript ab.
  foreach ($word in $line.Words) {
    $r = $word.BoundingRect
    $words += [ordered]@{
      text = $word.Text
      x = [int]$r.X; y = [int]$r.Y; w = [int]$r.Width; h = [int]$r.Height
    }
  }
  $lines += [ordered]@{ text = $line.Text; words = $words }
}

[ordered]@{
  ok       = $true
  language = $engine.RecognizerLanguage.LanguageTag
  region   = [ordered]@{ x = $X; y = $Y; w = $W; h = $H }
  text     = $result.Text
  lines    = $lines
} | ConvertTo-Json -Depth 6 -Compress | Write-JsonFile $Json

Write-Output "OCR fertig: $(@($result.Lines).Count) Zeilen, Sprache $($engine.RecognizerLanguage.LanguageTag)"
