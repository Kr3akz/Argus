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
# WARUM DIE AUFNAHME MANCHMAL VERGROESSERT WIRD (scale):
#   Nicht das Sprachmodell ist die Schwachstelle, sondern die Zeilenaufteilung.
#   Nachgemessen an data/ocr/: bei grenzwertiger Textgroesse wirft die Erkennung
#   zwei NEBENEINANDER stehende Karten in eine Zeile ("Vadarya Prime Receiver
#   Dual Zoren Prime Handle") - und dann fehlen zwei Namen. Vergroessern hilft
#   dagegen, aber nicht immer: bei 576p rettete 2,5x die Lesung von 2/4 auf 4/4,
#   bei 475p kippte dieselbe Vergroesserung sie von 4/4 auf 2/4. Ein fester
#   Faktor verschiebt den Bruchpunkt also nur.
#   Deshalb entscheidet dieses Skript nicht, sondern kann beides - und der
#   Aufrufer legt zwei Lesungen zusammen (siehe scanRewardsRepeatedly).
#
#   Die Rahmen kommen trotzdem immer in ECHTEN Bildschirmpixeln zurueck: sie
#   werden vor der Antwort wieder heruntergerechnet. Sonst saessen die
#   Preisschilder bei jeder vergroesserten Lesung um den Faktor daneben, und
#   zwei Lesungen liessen sich nicht ueber die Position zusammenlegen.
#
# WARUM DER AUSSCHNITT EINEN RAHMEN BRAUCHT (rect):
#   top/bottom waren immer Anteile des HAUPTBILDSCHIRMS. Gemeint war aber das
#   Spielfenster. Im randlosen Vollbild auf dem Hauptmonitor ist das dasselbe -
#   sonst nicht: bei zwei Monitoren liegt der zweite womoeglich bei x=-2560,
#   und PrimaryScreen kennt nur x=0..2560. Dann nimmt jeder Streifen den
#   FALSCHEN Monitor auf. Wer den Rahmen mitschickt, schneidet aus dem Spiel
#   aus statt aus dem Hauptbildschirm.
#
# PROTOKOLL (eine Zeile JSON rein, eine Zeile JSON raus):
#   ->  {"id":1,"top":0.28,"bottom":0.62}      Ausschnitt als Anteil der Hoehe
#   ->  {"id":2}                               ganzer Hauptbildschirm
#   ->  {"id":3,"source":"C:\\bild.png"}       vorhandenes Bild auswerten
#   ->  {"id":4,"png":"C:\\ablage.png"}        Aufnahme zusaetzlich sichern
#   ->  {"id":5,"scale":2.5}                   vor der Erkennung vergroessern
#   ->  {"id":6,"left":0.31,"right":0.44}      Ausschnitt als Anteil der Breite
#   ->  {"id":7,"rect":{"x":-2560,"y":0,"w":2560,"h":1440}}
#                                              Rahmen, auf den sich die
#                                              Anteile beziehen (Spielfenster)
#   <-  {"id":1,"ok":true,"language":"en-US","region":{...},"lines":[...]}
#   <-  {"ok":true,"ready":true,"language":"en-US","screen":{...},"dpiAware":true}
#                                              einmal beim Start
#
#   Meldungen an stderr sind Diagnose und gehoeren nicht zum Protokoll.

$ErrorActionPreference = 'Stop'

# stdout traegt das Protokoll: UTF-8 ohne BOM, sonst stolpert JSON.parse
# ueber das erste Zeichen der ersten Antwort.
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false

# ------------------------------------------------------- Bildschirmpixel --
#
# WARUM DAS HIER GANZ OBEN STEHT:
#   powershell.exe (Windows PowerShell 5.1) meldet sich Windows gegenueber
#   NICHT als DPI-bewusst. Bei einer Bildschirmskalierung von 125 % bekommt es
#   deshalb eine gefaelschte Welt zu sehen: PrimaryScreen.Bounds meldet
#   2048x1152 statt 2560x1440, und CopyFromScreen liefert eine hochgerechnete,
#   weiche Aufnahme - genau das Falsche fuer eine Texterkennung.
#
#   Zwei Dinge haengen daran. Erstens die Bildschaerfe. Zweitens die
#   Koordinaten: main.js teilt die zurueckgegebenen Rahmen durch den
#   Skalierungsfaktor, weil es ECHTE Pixel erwartet - bekaeme es gefaelschte,
#   saessen die Preisschilder bei 125 % um ein Fuenftel daneben. Und der
#   Fensterrahmen, den der Aufrufer schickt, kommt aus einem DPI-bewussten
#   Electron und ist immer echt.
#
#   Der Aufruf MUSS vor der ersten Bildschirmabfrage stehen; danach ist die
#   Einstellung des Prozesses festgeschrieben. Er kostet einmalig den
#   Add-Type-Uebersetzungslauf - deshalb gibt es warmUp().
#
#   Bei 100 % Skalierung aendert er nichts. Schlaegt er fehl (Windows aelter
#   als 1703), greift der aeltere Aufruf; schlaegt auch der fehl, laeuft alles
#   wie bisher.
$dpiAware = $false
try {
  Add-Type -Namespace Argus -Name Dpi -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr value);
[DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
'@
  # DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 = -4
  $dpiAware = [Argus.Dpi]::SetProcessDpiAwarenessContext([IntPtr](-4))
  if (-not $dpiAware) { $dpiAware = [Argus.Dpi]::SetProcessDPIAware() }
} catch {
  # Ohne DPI-Bewusstsein laeuft alles wie vor dieser Aenderung.
  $dpiAware = $false
}

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
# BitmapDecoder und StorageFile standen hier, solange gespeicherte Bilder ueber
# den WinRT-Decoder kamen. Sie gehen jetzt denselben Weg wie die Aufnahme, ueber
# System.Drawing - siehe Open-ImageFile.

# Bevorzugt Englisch, weil Warframes Itemnamen englisch sind. Es kostet nichts,
# und der Fallback steht direkt darunter.
#
# Erwarte davon aber nicht zu viel: nachgemessen an data/ocr/ fand das deutsche
# Modell ueber JEDE gepruefte Aufloesung genauso viele Namen wie das englische.
# Der einzige reproduzierbare Unterschied war "Zoren" gelesen als "Zoten" - ein
# Zeichen von dreiundzwanzig, das der Abgleich gegen die Droptabellen mit
# Reserve wegbuegelt. Wer hier eine fehlende Erkennung sucht, sucht an der
# falschen Stelle; die Zeilenaufteilung im Kopf dieser Datei ist die Ursache.
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

# Aus Rahmen und Anteilen den Ausschnitt in Pixeln.
#
# Die Anteile sind absichtlich keine Pixel: dieser Prozess kennt die echte
# Aufloesung, der Aufrufer rechnet in geraeteunabhaengigen Punkten - Anteile
# gehen bei beidem auf, und bei einem gespeicherten Bild ebenfalls.
#
# Ein zu schmaler Ausschnitt traegt keinen lesbaren Text. Dann gilt in dieser
# Achse wieder der ganze Rahmen: ein Fehlgriff soll den Blick nicht verbrennen,
# sondern hoechstens weniger genau machen.
function Get-CropRect($frame, [double]$top, [double]$bottom, [double]$left, [double]$right) {
  if ($top -lt 0)    { $top    = 0.0 }
  if ($bottom -gt 1) { $bottom = 1.0 }
  if ($left -lt 0)   { $left   = 0.0 }
  if ($right -gt 1)  { $right  = 1.0 }

  $X = $frame.X; $Y = $frame.Y; $W = $frame.Width; $H = $frame.Height
  if ($bottom -gt $top) {
    $Y = $frame.Y + [int]($frame.Height * $top)
    $H = [int]($frame.Height * ($bottom - $top))
  }
  if ($right -gt $left) {
    $X = $frame.X + [int]($frame.Width * $left)
    $W = [int]($frame.Width * ($right - $left))
  }
  if ($H -lt 16) { $Y = $frame.Y; $H = $frame.Height }
  if ($W -lt 16) { $X = $frame.X; $W = $frame.Width }
  return (New-Object System.Drawing.Rectangle $X, $Y, $W, $H)
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

# Vergroessern vor der Erkennung - siehe die Begruendung im Kopf.
# Bikubisch und nicht der Standard: aus weichen Buchstabenkanten wuerden sonst
# Treppen, und die liest die Erkennung schlechter als das kleine Original.
# Faktor 1 gibt das Original ZURUECK, statt es zu kopieren; wer aufraeumt, muss
# deshalb vergleichen, ob er ueberhaupt etwas Neues bekommen hat.
function Resize-Bitmap($src, [double]$factor) {
  if ($factor -le 1.0) { return $src }
  $w = [int]($src.Width * $factor); $h = [int]($src.Height * $factor)
  $dst = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($dst)
  try {
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode   = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.DrawImage($src, 0, 0, $w, $h)
  } finally { $g.Dispose() }
  return $dst
}

# Ein vorhandenes Bild auswerten - fuer Tests ohne laufendes Spiel.
#
# Ueber System.Drawing und nicht mehr ueber den WinRT-Decoder: so nehmen Bild
# und Bildschirmaufnahme denselben Weg, und die Vergroesserung oben gilt fuer
# beide. Sonst liesse sich ausgerechnet an einer gespeicherten Aufnahme nicht
# pruefen, was sie im Spiel bewirkt.
#
# Umgezeichnet statt durchgereicht: FromFile liefert das Format der Datei
# (oft 24bpp) und haelt die Datei offen, bis das Bitmap freigegeben wird.
# Beides will man hier nicht.
function Open-ImageFile([string]$Path) {
  $raw = [System.Drawing.Bitmap]::FromFile((Resolve-Path $Path).Path)
  try {
    $bmp = New-Object System.Drawing.Bitmap $raw.Width, $raw.Height, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    try { $g.DrawImage($raw, 0, 0, $raw.Width, $raw.Height) } finally { $g.Dispose() }
  } finally { $raw.Dispose() }
  return $bmp
}

# Von Hand statt ConvertTo-Json: das Ergebnis ist tief verschachtelt, und
# ConvertTo-Json braucht dafuer in Windows PowerShell sowohl -Depth als auch
# spuerbar Zeit. Hier zaehlt jede Zehntelsekunde.
#
# $Scale rechnet die Wortrahmen wieder auf die ECHTE Groesse herunter: gelesen
# wurde eventuell in einem vergroesserten Bild, aber nach draussen geht nur,
# wo die Woerter auf dem BILDSCHIRM stehen. region bleibt davon unberuehrt -
# darin steht schon der echte Ausschnitt.
function Build-Result([int]$replyId, $ocr, [int]$X, [int]$Y, [int]$W, [int]$H, [double]$Scale = 1.0) {
  if ($Scale -le 0) { $Scale = 1.0 }
  $sb = New-Object System.Text.StringBuilder
  [void]$sb.Append('{"id":').Append($replyId).Append(',"ok":true,"language":')
  [void]$sb.Append((ConvertTo-JsonString $engine.RecognizerLanguage.LanguageTag))
  [void]$sb.Append(',"scale":').Append($Scale.ToString([System.Globalization.CultureInfo]::InvariantCulture))
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
      [void]$sb.Append(',"x":').Append([int]($r.X / $Scale)).Append(',"y":').Append([int]($r.Y / $Scale))
      [void]$sb.Append(',"w":').Append([int]($r.Width / $Scale)).Append(',"h":').Append([int]($r.Height / $Scale)).Append('}')
    }
    [void]$sb.Append(']}')
  }
  [void]$sb.Append(']}')
  return $sb.ToString()
}

# ----------------------------------------------------------------- Schleife --

# Die Startmeldung nennt auch, WIE dieser Prozess den Desktop sieht. Das ist
# nicht Zierde: weicht seine Sicht von der des Aufrufers ab - unterschiedliches
# DPI-Bewusstsein -, sitzt jeder mitgeschickte Fensterrahmen daneben, und ohne
# diese Zahlen waere das nirgends zu sehen.
$virt = [System.Windows.Forms.SystemInformation]::VirtualScreen
$prim = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
Write-Reply ('{"ok":true,"ready":true,"language":' + (ConvertTo-JsonString $engine.RecognizerLanguage.LanguageTag) +
             ',"dpiAware":' + $(if ($dpiAware) { 'true' } else { 'false' }) +
             ',"screen":{"x":' + $virt.X + ',"y":' + $virt.Y + ',"w":' + $virt.Width + ',"h":' + $virt.Height + '}' +
             ',"primary":{"x":' + $prim.X + ',"y":' + $prim.Y + ',"w":' + $prim.Width + ',"h":' + $prim.Height + '}}')

while ($true) {
  $raw = [Console]::In.ReadLine()
  if ($null -eq $raw) { break }          # stdin zu: der Aufrufer ist gegangen
  $raw = $raw.Trim()
  if (-not $raw) { continue }

  $id = 0
  try {
    $req = $raw | ConvertFrom-Json
    if ($req.id) { $id = [int]$req.id }

    # --- Die Anteile, die den Ausschnitt beschreiben ----------------------
    #
    # left/right kamen dazu, als klar wurde, dass nicht das Sprachmodell die
    # Schwachstelle ist, sondern die Zeilenaufteilung: die Erkennung wirft zwei
    # NEBENEINANDER stehende Karten in eine Zeile. Steht im Ausschnitt nur eine
    # Karte, kann das nicht mehr passieren.
    $top = 0.0; $bottom = 1.0; $left = 0.0; $right = 1.0
    if ($null -ne $req.top)    { $top    = [double]$req.top }
    if ($null -ne $req.bottom) { $bottom = [double]$req.bottom }
    if ($null -ne $req.left)   { $left   = [double]$req.left }
    if ($null -ne $req.right)  { $right  = [double]$req.right }

    # Nur vergroessern, nie verkleinern - und nicht ins Uferlose: bei 4x waere
    # ein 1440p-Bildschirm 5760 Zeilen hoch, und die Erkennung braucht dafuer
    # laenger als die Bedenkzeit auf dem Belohnungsbildschirm hergibt.
    $scale = 1.0
    if ($null -ne $req.scale) { $scale = [double]$req.scale }
    if ($scale -lt 1) { $scale = 1.0 }
    if ($scale -gt 4) { $scale = 4.0 }

    $png = ''
    if ($req.png) {
      $png = [string]$req.png
      $dir = Split-Path -Parent $png
      if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    }

    # --- Der Rahmen, auf den sich die Anteile beziehen --------------------
    #
    #   ein gespeichertes Bild -> das Bild selbst
    #   rect                   -> das Spielfenster
    #   sonst                  -> der Hauptbildschirm, wie bisher
    #
    # Der Rahmen muss VOR dem Zuschnitt feststehen, denn er ist dessen
    # Bezugsgroesse. Frueher stand er nur fuer den Bildschirm fest, und das
    # gespeicherte Bild wurde ungeschnitten durchgereicht - dann liesse sich
    # ausgerechnet die Spaltenlesung nie ohne laufendes Spiel pruefen.
    $quelle = $null
    if ($req.source) { $quelle = Open-ImageFile ([string]$req.source) }

    if ($quelle) {
      $frame = New-Object System.Drawing.Rectangle 0, 0, $quelle.Width, $quelle.Height
    } else {
      $frame = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
      if ($null -ne $req.rect) {
        $cand = New-Object System.Drawing.Rectangle(
                  [int]$req.rect.x, [int]$req.rect.y, [int]$req.rect.w, [int]$req.rect.h)
        # Was ausserhalb des sichtbaren Desktops liegt, laesst sich nicht
        # aufnehmen - CopyFromScreen liefert dort Schwarz. Also zuschneiden,
        # und wenn nichts Brauchbares uebrig bleibt, lieber den Hauptbildschirm
        # nehmen als in eine schwarze Flaeche zu lesen.
        $cand = [System.Drawing.Rectangle]::Intersect(
                  $cand, [System.Windows.Forms.SystemInformation]::VirtualScreen)
        if ($cand.Width -ge 64 -and $cand.Height -ge 64) { $frame = $cand }
      }
    }

    $crop = Get-CropRect $frame $top $bottom $left $right
    $X = $crop.X; $Y = $crop.Y; $W = $crop.Width; $H = $crop.Height

    # Beide Quellen liefern ein GDI-Bitmap, damit die Vergroesserung danach fuer
    # beide gilt. Gesichert wird immer das ORIGINAL - ein Beweisbild soll
    # zeigen, was auf dem Bildschirm stand, nicht was daraus gemacht wurde.
    $bitmap = $null
    if ($quelle) {
      if ($crop.Width -eq $quelle.Width -and $crop.Height -eq $quelle.Height) {
        $gdi = $quelle
      } else {
        $gdi = $quelle.Clone($crop, $quelle.PixelFormat)
        $quelle.Dispose()
      }
      if ($png) { $gdi.Save($png, [System.Drawing.Imaging.ImageFormat]::Png) }
    } else {
      $gdi = Get-ScreenBitmap $X $Y $W $H $png
    }
    try {
      $scaled = Resize-Bitmap $gdi $scale
      try     { $bitmap = ConvertTo-SoftwareBitmap $scaled }
      # Bei Faktor 1 ist $scaled dasselbe Bitmap wie $gdi - dann gibt es hier
      # nichts freizugeben, sonst faellt der finally-Block darunter ueber eine
      # bereits geschlossene Bitmap.
      finally { if (-not [object]::ReferenceEquals($scaled, $gdi)) { $scaled.Dispose() } }
    } finally { $gdi.Dispose() }

    try {
      $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
      Write-Reply (Build-Result $id $result $X $Y $W $H $scale)
    } finally { $bitmap.Dispose() }
  } catch {
    # Ein misslungener Blick ist kein Grund, den Dauerlaeufer zu beenden - der
    # naechste kann gelingen. Nur diese eine Antwort meldet den Fehler.
    Write-Reply ('{"id":' + $id + ',"ok":false,"error":' + (ConvertTo-JsonString $_.Exception.Message) + '}')
  }
}
