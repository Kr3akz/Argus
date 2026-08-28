# Dauerlaeufer fuer die Texterkennung: einmal starten, viele Aufnahmen.
#
# WARUM EIN DAUERLAEUFER:
#   ocr-capture.ps1 macht dasselbe, aber pro Aufnahme einmal. Nachgemessen
#   kostet das 1,2 s - und davon entfallen nur 116 ms auf die Erkennung selbst.
#   Der Rest ist Anlauf: PowerShell starten (240 ms), Assemblies laden,
#   WinRT-Typen aufloesen, die Erkennung aufbauen (zusammen ~180 ms) und das
#   Bild als PNG auf die Platte schreiben und wieder einlesen (~340 ms).
#   Auf dem Belohnungsbildschirm laeuft eine Uhr: 15 Sekunden, und in denen
#   soll mehrfach hingesehen werden koennen. Also faellt der Anlauf einmal an,
#   nicht bei jedem Blick.
#
#   Nachgemessen mit warmem Prozess: 180-250 ms fuer den ganzen Bildschirm,
#   70-90 ms fuer den Streifen, in dem die vier Namen stehen.
#
# WARUM KEIN BILD MEHR AUF DIE PLATTE:
#   Die Pixel gehen direkt aus dem GDI-Bitmap in eine SoftwareBitmap. Das
#   spart nicht nur das Kodieren und Wiedereinlesen - es bedeutet auch, dass
#   ohne -Png ueberhaupt kein Bildschirmfoto entsteht, das jemand spaeter
#   finden koennte.
#
# PROTOKOLL (eine Zeile JSON rein, eine Zeile JSON raus):
#   ->  {"id":1,"top":0.28,"bottom":0.62}      Ausschnitt als Anteil der Hoehe
#   ->  {"id":2}                               ganzer Hauptbildschirm
#   ->  {"id":3,"source":"C:\\bild.png"}       vorhandenes Bild auswerten
#   ->  {"id":4,"png":"C:\\ablage.png"}        Aufnahme zusaetzlich sichern
#   <-  {"id":1,"ok":true,"language":"en-US","region":{...},"lines":[...]}
#   <-  {"ok":true,"ready":true,"language":"en-US"}   einmal beim Start
#
#   Meldungen an stderr sind Diagnose und gehoeren nicht zum Protokoll.

$ErrorActionPreference = 'Stop'

# stdout traegt das Protokoll: UTF-8 ohne BOM, sonst stolpert JSON.parse
# ueber das erste Zeichen der ersten Antwort.
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Runtime.WindowsRuntime

# WinRT-Aufrufe sind asynchron; in Windows PowerShell braucht es diesen Umweg
# ueber AsTask, um auf das Ergebnis zu warten.
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
  $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]

function Await($task, $type) {
  $netTask = $asTaskGeneric.MakeGenericMethod($type).Invoke($null, @($task))
  $netTask.Wait(-1) | Out-Null
  $netTask.Result
}

# JEDER Typ, der spaeter beim Namen genannt wird, muss hier stehen.
# Windows.Globalization.Language fehlte lange - und weil New-Object darauf nur
# eine Ausnahme wirft, die ein leeres catch verschluckt hat, lief die Erkennung
# still in der Sprache des Benutzerprofils: bei deutschem Windows also mit
# deutschem Sprachmodell auf englische Itemnamen.
$null = [Windows.Media.Ocr.OcrEngine,                Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Globalization.Language,             Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.SoftwareBitmap,    Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapPixelFormat, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder,     Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Storage.StorageFile,                Windows.Foundation, ContentType = WindowsRuntime]

# Bevorzugt Englisch: Warframes Itemnamen sind englisch, und ein deutsches
# Sprachmodell zieht sie in Richtung deutscher Woerter ("Paris" -> "kris").
$engine = $null
try {
  $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage(
              (New-Object Windows.Globalization.Language 'en-US'))
} catch { $engine = $null }
if ($null -eq $engine) { $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages() }

function ConvertTo-JsonString([string]$s) {
  if ($null -eq $s) { return '""' }
  $sb = New-Object System.Text.StringBuilder
  [void]$sb.Append('"')
  foreach ($ch in $s.ToCharArray()) {
    $code = [int]$ch
    if     ($ch -ceq [char]0x22) { [void]$sb.Append('\"') }
    elseif ($ch -ceq [char]0x5C) { [void]$sb.Append('\\') }
    elseif ($code -eq 8)  { [void]$sb.Append('\b') }
    elseif ($code -eq 12) { [void]$sb.Append('\f') }
    elseif ($code -eq 10) { [void]$sb.Append('\n') }
    elseif ($code -eq 13) { [void]$sb.Append('\r') }
    elseif ($code -eq 9)  { [void]$sb.Append('\t') }
    # Steuerzeichen muessen escaped werden, alles andere geht als UTF-8 raus.
    elseif ($code -lt 32) { [void]$sb.Append(('\u{0:x4}' -f $code)) }
    else                  { [void]$sb.Append($ch) }
  }
  [void]$sb.Append('"')
  return $sb.ToString()
}

function Write-Reply([string]$json) { [Console]::Out.WriteLine($json); [Console]::Out.Flush() }

if ($null -eq $engine) {
  Write-Reply ('{"ok":false,"ready":false,"error":' + (ConvertTo-JsonString 'Keine OCR-Sprache installiert') + '}')
  exit 1
}

# ---------------------------------------------------------------- Aufnahme --

function Get-ScreenBitmap([int]$X, [int]$Y, [int]$W, [int]$H, [string]$Png) {
  $bmp = New-Object System.Drawing.Bitmap $W, $H, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  try     { $g.CopyFromScreen($X, $Y, 0, 0, (New-Object System.Drawing.Size($W, $H))) }
  finally { $g.Dispose() }
  # Nur wenn ausdruecklich verlangt - sonst entsteht kein Bild auf der Platte.
  if ($Png) { $bmp.Save($Png, [System.Drawing.Imaging.ImageFormat]::Png) }
  return $bmp
}

# GDI-Bitmap -> SoftwareBitmap, ohne Umweg ueber Datei oder Kodierung.
# Format32bppArgb liegt im Speicher als BGRA - genau das, was Bgra8 erwartet.
function ConvertTo-SoftwareBitmap($bmp) {
  $bmpW = $bmp.Width; $bmpH = $bmp.Height
  $rect = New-Object System.Drawing.Rectangle 0, 0, $bmpW, $bmpH
  $data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly,
                        [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  try {
    $bytes = New-Object byte[] ($data.Stride * $bmpH)
    [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
  } finally { $bmp.UnlockBits($data) }

  $buf = [System.Runtime.InteropServices.WindowsRuntime.WindowsRuntimeBufferExtensions]::AsBuffer($bytes)
  return [Windows.Graphics.Imaging.SoftwareBitmap]::CreateCopyFromBuffer(
           $buf, [Windows.Graphics.Imaging.BitmapPixelFormat]::Bgra8, $bmpW, $bmpH)
}

function Read-ImageFile([string]$Path) {
  $file    = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync((Resolve-Path $Path).Path)) ([Windows.Storage.StorageFile])
  $stream  = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  return Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
}

# Von Hand statt ConvertTo-Json: das Ergebnis ist tief verschachtelt, und
# ConvertTo-Json braucht dafuer in Windows PowerShell sowohl -Depth als auch
# spuerbar Zeit. Hier zaehlt jede Zehntelsekunde.
function Build-Result([int]$replyId, $ocr, [int]$X, [int]$Y, [int]$W, [int]$H) {
  $sb = New-Object System.Text.StringBuilder
  [void]$sb.Append('{"id":').Append($replyId).Append(',"ok":true,"language":')
  [void]$sb.Append((ConvertTo-JsonString $engine.RecognizerLanguage.LanguageTag))
  [void]$sb.Append(',"region":{"x":').Append($X).Append(',"y":').Append($Y)
  [void]$sb.Append(',"w":').Append($W).Append(',"h":').Append($H).Append('},"lines":[')

  $firstLine = $true
  foreach ($line in $ocr.Lines) {
    if (-not $firstLine) { [void]$sb.Append(',') }
    $firstLine = $false
    [void]$sb.Append('{"text":').Append((ConvertTo-JsonString $line.Text)).Append(',"words":[')
    $firstWord = $true
    # Bewusst $word und nicht $w: PowerShell unterscheidet keine Gross- und
    # Kleinschreibung, $w waere derselbe Name wie die Breite oben.
    foreach ($word in $line.Words) {
      if (-not $firstWord) { [void]$sb.Append(',') }
      $firstWord = $false
      $r = $word.BoundingRect
      [void]$sb.Append('{"text":').Append((ConvertTo-JsonString $word.Text))
      [void]$sb.Append(',"x":').Append([int]$r.X).Append(',"y":').Append([int]$r.Y)
      [void]$sb.Append(',"w":').Append([int]$r.Width).Append(',"h":').Append([int]$r.Height).Append('}')
    }
    [void]$sb.Append(']}')
  }
  [void]$sb.Append(']}')
  return $sb.ToString()
}

# ----------------------------------------------------------------- Schleife --

Write-Reply ('{"ok":true,"ready":true,"language":' + (ConvertTo-JsonString $engine.RecognizerLanguage.LanguageTag) + '}')

while ($true) {
  $raw = [Console]::In.ReadLine()
  if ($null -eq $raw) { break }          # stdin zu: der Aufrufer ist gegangen
  $raw = $raw.Trim()
  if (-not $raw) { continue }

  $id = 0
  try {
    $req = $raw | ConvertFrom-Json
    if ($req.id) { $id = [int]$req.id }

    $screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    $X = $screen.X; $Y = $screen.Y; $W = $screen.Width; $H = $screen.Height

    # top/bottom sind Anteile der Bildschirmhoehe. Absichtlich nicht Pixel:
    # dieser Prozess kennt die echte Aufloesung, der Aufrufer rechnet in
    # geraeteunabhaengigen Punkten - Anteile gehen bei beidem auf.
    $top = 0.0; $bottom = 1.0
    if ($null -ne $req.top)    { $top    = [double]$req.top }
    if ($null -ne $req.bottom) { $bottom = [double]$req.bottom }
    if ($top -lt 0)    { $top = 0.0 }
    if ($bottom -gt 1) { $bottom = 1.0 }
    if ($bottom -gt $top) {
      $Y = $screen.Y + [int]($screen.Height * $top)
      $H = [int]($screen.Height * ($bottom - $top))
    }
    # Ein zu schmaler Streifen taugt nicht zum Lesen - dann lieber alles.
    if ($H -lt 16) { $Y = $screen.Y; $H = $screen.Height }

    $png = ''
    if ($req.png) {
      $png = [string]$req.png
      $dir = Split-Path -Parent $png
      if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    }

    $bitmap = $null
    if ($req.source) {
      $bitmap = Read-ImageFile ([string]$req.source)
      $X = 0; $Y = 0; $W = $bitmap.PixelWidth; $H = $bitmap.PixelHeight
    } else {
      $gdi = Get-ScreenBitmap $X $Y $W $H $png
      try     { $bitmap = ConvertTo-SoftwareBitmap $gdi }
      finally { $gdi.Dispose() }
    }

    try {
      $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
      Write-Reply (Build-Result $id $result $X $Y $W $H)
    } finally { $bitmap.Dispose() }
  } catch {
    # Ein misslungener Blick ist kein Grund, den Dauerlaeufer zu beenden - der
    # naechste kann gelingen. Nur diese eine Antwort meldet den Fehler.
    Write-Reply ('{"id":' + $id + ',"ok":false,"error":' + (ConvertTo-JsonString $_.Exception.Message) + '}')
  }
}
