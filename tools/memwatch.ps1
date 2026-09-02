# Decken ALLE Puffer zusammen das vollstaendige Inventar ab?
#
# STAND DER UNTERSUCHUNG:
#   - Der echte Inventar-JSON liegt im Heap (belegt mit echten Werten).
#   - Er liegt hunderte KB am Stueck; die 64-KB-Grenzen waren ein Messartefakt.
#   - Er zerfaellt NICHT: derselbe Puffer war ueber mehrere Minuten und
#     mehrere Durchgaenge byte-identisch.
#   - Aber jeder einzelne Puffer ist unvollstaendig und an beiden Enden mitten
#     im Token abgeschnitten. Gesehen: 352 KB mit 7 Feldern, 723 KB mit 12.
#
# DIE FRAGE, DIE BLEIBT:
#   Das Dokument kommt in MEHREREN Puffern gleichzeitig an, jeder mit einem
#   anderen Ausschnitt. Ergeben sie zusammen alle Felder? Dann ist Weg A eine
#   Frage der Reihenfolge. Ergeben sie es nicht, ist er tot.
#
# ZWEI FEHLER FRUEHERER FASSUNGEN, die hier behoben sind:
#
#   1. VARIABLENKOLLISION. Die Feldliste hiess $KEYS, die Felder einer Scheibe
#      $keys - fuer PowerShell derselbe Name, Gross-/Kleinschreibung zaehlt bei
#      Variablen nicht. Die erste Zuweisung ueberschrieb damit die Feldliste mit
#      einer Hashtable, und ab da meldete jede Scheibe null Felder. Die Liste
#      heisst jetzt $FIELDS, die Scheibenfelder $sliceKeys.
#
#   2. TEILLESUNGEN VERWORFEN. Read-Text gab bei ReadProcessMemory=FALSE null
#      zurueck. Ragt ein 64-KB-Fenster in nicht gemappten Speicher, meldet
#      Windows aber ERROR_PARTIAL_COPY und schreibt die gueltigen Bytes trotzdem
#      - genau wie procmem.js es behandelt. Ohne das kam fuer jede Scheibe nahe
#      einer Mappinggrenze 0 KB heraus.
#
# BEDIENUNG:
#   Starten und laufen lassen, Zonenwechsel jederzeit. Jeder Durchgang meldet
#   ALLE Scheiben und die Vereinigung ihrer Felder. [neu] markiert Adressen,
#   die im vorherigen Durchgang noch nicht da waren.
#
# SCHREIBT NICHTS AUF PLATTE. NUR LESEND.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/memwatch.ps1

param(
  [string]$Anchor = '"RawUpgrades"',
  [int]$MaxMinutes = 6,
  [int]$MaxSlices = 48,
  [double]$RangeFrom = 0x1BC00000000,
  [double]$RangeTo   = 0x1BF00000000
)

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class MemW {
  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern IntPtr OpenProcess(int dwDesiredAccess, bool bInheritHandle, int dwProcessId);
  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern bool ReadProcessMemory(IntPtr hProcess, IntPtr lpBaseAddress, byte[] lpBuffer, IntPtr dwSize, out IntPtr lpNumberOfBytesRead);
  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern IntPtr VirtualQueryEx(IntPtr hProcess, IntPtr lpAddress, out MEMORY_BASIC_INFORMATION lpBuffer, IntPtr dwLength);
  [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr hObject);
  [StructLayout(LayoutKind.Sequential)]
  public struct MEMORY_BASIC_INFORMATION {
    public IntPtr BaseAddress; public IntPtr AllocationBase;
    public int AllocationProtect; public int __align1;
    public IntPtr RegionSize; public int State; public int Protect; public int Type; public int __align2;
  }
}
"@

$STEP = 64KB
$enc  = [Text.Encoding]::GetEncoding(28591)

# Schrittweite fuer das Abschreiten der Spannweite. KLEIN, und zwar mit Grund:
# ragt ein Lesefenster ueber das Ende der gemappten Region hinaus, kopiert
# Windows GAR NICHTS (got = 0) statt teilweise. Mit 64 KB kostete das die
# gesamte Messung - daher die vielen "0 KB" in frueheren Laeufen. Mit 4 KB
# kostet eine nicht gemappte Seite nur diese Seite. Dasselbe Motiv wie das
# Haeppchenlesen in procmem.js.
$WALK = 4KB

# Steuerzeichen, die einen Textlauf beenden: 0..8, 11..12, 14..31.
# Tab, LF und CR bleiben bewusst draussen, Bytes >= 128 ebenfalls (Umlaute in
# Clan- und Rivennamen sind Text). IndexOfAny ist nativ - eine zeichenweise
# PowerShell-Schleife braucht bei mehreren MB je Durchgang zu lange.
$CTRL = [char[]]((0..8) + (11..12) + (14..31))

# NICHT $KEYS nennen - siehe Fehler 1 im Kopf.
$FIELDS = @(
  'Suits','LongGuns','Pistols','Melee','Sentinels','SentinelWeapons','SpaceSuits',
  'SpaceGuns','SpecialItems','MechSuits','Hoverboards','OperatorAmps','Recipes',
  'MiscItems','RawUpgrades','Upgrades','PendingRecipes','RegularCredits',
  'PremiumCredits','FusionPoints','QuestKeys','InfestedFoundry','Boosters','PlayerLevel'
)

# Teillesungen mitnehmen: $got zaehlt, nicht der Rueckgabewert. Siehe Fehler 2.
function Read-Text([IntPtr]$hProc, [int64]$at, [int]$len) {
  $b = New-Object byte[] $len
  $got = [IntPtr]::Zero
  $null = [MemW]::ReadProcessMemory($hProc, [IntPtr]$at, $b, [IntPtr]$len, [ref]$got)
  $n = [int]$got
  if ($n -le 0) { return $null }
  return $enc.GetString($b, 0, $n)
}

function Test-TextChar([int]$c) { return ($c -ge 32 -or $c -eq 9 -or $c -eq 10 -or $c -eq 13) }

# Spannweite einer Scheibe ab dem Anker, ueber Regionsgrenzen hinweg.
function Measure-Slice([IntPtr]$hProc, [int64]$anchorAt) {
  $fwd = 0; $cur = $anchorAt
  while ($fwd -lt 16MB) {
    $t = Read-Text $hProc $cur $WALK
    if ($null -eq $t) { break }
    $bad = $t.IndexOfAny($CTRL)
    if ($bad -ge 0) { $fwd += $bad; break }
    $fwd += $t.Length; $cur += $t.Length
    if ($t.Length -lt $WALK) { break }
  }
  $bwd = 0; $cur = $anchorAt
  while ($bwd -lt 16MB) {
    $t = Read-Text $hProc ($cur - $WALK) $WALK
    if ($null -eq $t) { break }
    $bad = $t.LastIndexOfAny($CTRL)
    if ($bad -ge 0) { $bwd += ($t.Length - 1 - $bad); break }
    $bwd += $t.Length; $cur -= $t.Length
    if ($t.Length -lt $WALK) { break }
  }
  return @{ Fwd = $fwd; Bwd = $bwd; Start = ($anchorAt - $bwd); Total = ($fwd + $bwd) }
}

# Welche Felder stehen in dieser Scheibe? Haeppchenweise, mit Naht.
function Get-SliceKeys([IntPtr]$hProc, [int64]$start, [int]$total) {
  $present = @{}
  $cur = $start; $left = $total; $seam = ''
  while ($left -gt 0) {
    $want = [Math]::Min($STEP, $left)
    $t = Read-Text $hProc $cur $want
    if ($null -eq $t) { break }
    $probe = $seam + $t
    foreach ($f in $FIELDS) {
      if (-not $present.ContainsKey($f) -and $probe.IndexOf('"' + $f + '"', [StringComparison]::Ordinal) -ge 0) {
        $present[$f] = $true
      }
    }
    $seam = $probe.Substring([Math]::Max(0, $probe.Length - 32))
    $cur += $t.Length; $left -= $t.Length
    if ($t.Length -lt $want) { break }
  }
  return $present
}

$proc = Get-Process -Name "Warframe.x64" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $proc) { Write-Output "Warframe laeuft nicht."; exit 1 }

$h = [MemW]::OpenProcess((0x0010 -bor 0x0400), $false, $proc.Id)
if ($h -eq [IntPtr]::Zero) { Write-Output "OpenProcess fehlgeschlagen."; exit 1 }

$MEM_COMMIT = 0x1000; $MEM_PRIVATE = 0x20000
$mbiSize = [Runtime.InteropServices.Marshal]::SizeOf([type][MemW+MEMORY_BASIC_INFORMATION])
$from = [int64]$RangeFrom
$to   = [int64]$RangeTo

Write-Output "Prozess: PID $($proc.Id)"
Write-Output ("Bereich: 0x{0} .. 0x{1}, Laufzeit {2} min, Feldliste {3} Eintraege" -f `
              $from.ToString('X'), $to.ToString('X'), $MaxMinutes, $FIELDS.Count)
Write-Output ""

$deadline = (Get-Date).AddMinutes($MaxMinutes)
$pass = 0
$prevSeen = @{}
$bestUnion = 0
$bestPass = 0

while ((Get-Date) -lt $deadline) {
  $pass++
  $passStart = Get-Date
  $addr = [IntPtr]$from
  $anchors = @()

  while ($anchors.Count -lt $MaxSlices) {
    $mbi = New-Object MemW+MEMORY_BASIC_INFORMATION
    if ([MemW]::VirtualQueryEx($h, $addr, [ref]$mbi, [IntPtr]$mbiSize) -eq [IntPtr]::Zero) { break }
    $size = [int64]$mbi.RegionSize
    if ($size -le 0) { break }
    $base = [int64]$mbi.BaseAddress
    if ($to -gt 0 -and $base -gt $to) { break }

    $prot = $mbi.Protect
    $isHeap = ($mbi.State -eq $MEM_COMMIT) -and ($mbi.Type -eq $MEM_PRIVATE) -and
              (($prot -band 0x04) -or ($prot -band 0x40)) -and -not ($prot -band 0x100)
    if ($isHeap -and $size -ge 4096 -and $size -le 128MB) {
      $s = Read-Text $h $base ([int]$size)
      if ($null -ne $s) {
        $p = $s.IndexOf($Anchor, [StringComparison]::Ordinal)
        while ($p -ge 0 -and $anchors.Count -lt $MaxSlices) {
          $anchors += ($base + $p)
          $p = $s.IndexOf($Anchor, $p + $Anchor.Length, [StringComparison]::Ordinal)
        }
        $s = $null
      }
    }
    $next = $base + $size
    if ($next -le [int64]$addr) { break }
    $addr = [IntPtr]$next
  }

  $secs = [math]::Round(((Get-Date) - $passStart).TotalSeconds, 1)

  if ($anchors.Count -eq 0) {
    Write-Output ("Durchgang {0,-3} {1}  ({2,5}s): keine Scheibe" -f $pass, (Get-Date -Format 'HH:mm:ss'), $secs)
    $prevSeen = @{}
    continue
  }

  Write-Output ("Durchgang {0,-3} {1}  ({2,5}s): {3} Scheiben" -f `
                $pass, (Get-Date -Format 'HH:mm:ss'), $secs, $anchors.Count)

  $union = @{}
  $sumBytes = 0
  $seen = @{}

  foreach ($a in $anchors) {
    $seen[$a] = $true
    $m = Measure-Slice $h $a
    $sliceKeys = Get-SliceKeys $h $m.Start $m.Total
    $sumBytes += $m.Total
    foreach ($f in $sliceKeys.Keys) { $union[$f] = $true }
    $tag = if ($prevSeen.ContainsKey($a)) { '     ' } else { '[neu]' }
    $names = @($FIELDS | Where-Object { $sliceKeys.ContainsKey($_) })
    Write-Output ("   {0} 0x{1}  {2,8} KB  {3,2} Felder: {4}" -f `
                  $tag, ([int64]$a).ToString('X'), [math]::Round($m.Total/1KB,1), $names.Count, ($names -join ', '))
  }

  $have = @($FIELDS | Where-Object { $union.ContainsKey($_) })
  $miss = @($FIELDS | Where-Object { -not $union.ContainsKey($_) })
  Write-Output ("   ==> VEREINIGUNG {0}/{1} Felder, {2} KB gesamt" -f `
                $have.Count, $FIELDS.Count, [math]::Round($sumBytes/1KB,1))
  if ($miss.Count) { Write-Output ("       fehlt weiterhin: {0}" -f ($miss -join ', ')) }
  Write-Output ""

  if ($have.Count -gt $bestUnion) { $bestUnion = $have.Count; $bestPass = $pass }
  $prevSeen = $seen
}

[void][MemW]::CloseHandle($h)
Write-Output "Fertig nach $pass Durchgaengen."
Write-Output ("Beste Vereinigung: {0}/{1} Felder (Durchgang {2})" -f $bestUnion, $FIELDS.Count, $bestPass)
Write-Output "--- Deutung ---"
Write-Output "  Vereinigung nahe 24 => die Scheiben ergeben zusammen das Inventar, Weg A ist eine Frage der Reihenfolge."
Write-Output "  Vereinigung bleibt niedrig => Teile kommen nie im Klartext an, Weg A ist tot."
