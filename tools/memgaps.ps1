# Die drei Felder, die in keiner Scheibe auftauchten - gibt es sie ueberhaupt?
#
# STAND:
#   memwatch.ps1 hat 21 von 24 Feldern belegt, eine einzelne Scheibe von rund
#   1 MB trug sie allein. Nie gesehen wurden:
#     PendingRecipes   - laufende Foundry
#     InfestedFoundry  - Helminth
#     PremiumCredits   - Platin (vermutlich nur ein Namensproblem, im Kopf
#                        jeder Scheibe steht "PremiumCreditsFree")
#
#   Alle Scheiben beginnen an derselben Stelle des Dokuments. Was davor steht,
#   ist ueber den bisherigen Anker unerreichbar. Diese Sonde sucht die drei
#   Felder deshalb DIREKT, heap-weit, statt sie in Scheiben zu suchen, die von
#   "RawUpgrades" aus gefunden wurden.
#
# DIE ENTSCHEIDENDE ZUSATZFRAGE je Fund:
#   Enthaelt derselbe Textlauf AUCH "RawUpgrades" und "MiscItems"? Dann ist es
#   dasselbe Inventardokument, nur ein anderer Ausschnitt - und mit einem
#   passenden Anker erreichbar. Steht das Feld isoliert, gehoert es zu einer
#   anderen Antwort und hilft uns nicht.
#
# SCHREIBT NICHTS AUF PLATTE. AUSGABE GESAEUBERT. NUR LESEND.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/memgaps.ps1

param(
  [int]$HitsPerAnchor = 3,
  [int]$MaxMinutes = 8
)

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class MemG {
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

$WALK = 4KB          # klein, weil ein ueberstehendes Fenster GAR NICHTS liefert
$enc  = [Text.Encoding]::GetEncoding(28591)
$CTRL = [char[]]((0..8) + (11..12) + (14..31))

# Die drei Vermissten, plus PremiumCreditsFree zur Klaerung der Namensfrage.
$ANCHORS = @('"PendingRecipes"', '"InfestedFoundry"', '"PremiumCredits"', '"PremiumCreditsFree"')

# Marker, an denen sich das Inventardokument erkennen laesst.
$SIBLINGS = @('RawUpgrades', 'MiscItems', 'Suits', 'RegularCredits', 'Recipes', 'Upgrades')

function Scrub([string]$t) {
  $t = [regex]::Replace($t, '[0-9a-fA-F]{24}', '<id>')
  $t = [regex]::Replace($t, '("DisplayName":")[^"]*', '${1}<name>')
  $t = [regex]::Replace($t, '\d{12,}', '<num>')
  return $t
}

function Read-Text([IntPtr]$hProc, [int64]$at, [int]$len) {
  $b = New-Object byte[] $len
  $got = [IntPtr]::Zero
  $null = [MemG]::ReadProcessMemory($hProc, [IntPtr]$at, $b, [IntPtr]$len, [ref]$got)
  $n = [int]$got
  if ($n -le 0) { return $null }
  return $enc.GetString($b, 0, $n)
}

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
  return @{ Bwd = $bwd; Fwd = $fwd; Start = ($anchorAt - $bwd); Total = ($fwd + $bwd) }
}

# Welche Geschwisterfelder stehen im selben Lauf?
function Get-Siblings([IntPtr]$hProc, [int64]$start, [int]$total) {
  $present = @{}
  $cur = $start; $left = $total; $seam = ''
  while ($left -gt 0) {
    $want = [Math]::Min(64KB, $left)
    $t = Read-Text $hProc $cur $want
    if ($null -eq $t) { break }
    $probe = $seam + $t
    foreach ($s in $SIBLINGS) {
      if (-not $present.ContainsKey($s) -and $probe.IndexOf('"' + $s + '"', [StringComparison]::Ordinal) -ge 0) {
        $present[$s] = $true
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

$h = [MemG]::OpenProcess((0x0010 -bor 0x0400), $false, $proc.Id)
if ($h -eq [IntPtr]::Zero) { Write-Output "OpenProcess fehlgeschlagen."; exit 1 }

$MEM_COMMIT = 0x1000; $MEM_PRIVATE = 0x20000
$mbiSize = [Runtime.InteropServices.Marshal]::SizeOf([type][MemG+MEMORY_BASIC_INFORMATION])

Write-Output "Prozess: PID $($proc.Id)"
Write-Output "Suche heap-weit nach: $($ANCHORS -join ', ')"
Write-Output ""

# --- Durchgang 1: Adressen einsammeln ---
$hits = @{}
foreach ($a in $ANCHORS) { $hits[$a] = @() }

$addr = [IntPtr]::Zero
$sw = [Diagnostics.Stopwatch]::StartNew()
$regions = 0; $scanned = 0

while ($sw.Elapsed.TotalMinutes -lt $MaxMinutes) {
  $mbi = New-Object MemG+MEMORY_BASIC_INFORMATION
  if ([MemG]::VirtualQueryEx($h, $addr, [ref]$mbi, [IntPtr]$mbiSize) -eq [IntPtr]::Zero) { break }
  $size = [int64]$mbi.RegionSize
  if ($size -le 0) { break }
  $base = [int64]$mbi.BaseAddress

  $prot = $mbi.Protect
  $isHeap = ($mbi.State -eq $MEM_COMMIT) -and ($mbi.Type -eq $MEM_PRIVATE) -and
            (($prot -band 0x04) -or ($prot -band 0x40)) -and -not ($prot -band 0x100)
  if ($isHeap -and $size -ge 4096 -and $size -le 128MB) {
    $s = Read-Text $h $base ([int]$size)
    if ($null -ne $s) {
      $regions++; $scanned += $s.Length
      foreach ($a in $ANCHORS) {
        if ($hits[$a].Count -ge $HitsPerAnchor) { continue }
        $p = $s.IndexOf($a, [StringComparison]::Ordinal)
        while ($p -ge 0 -and $hits[$a].Count -lt $HitsPerAnchor) {
          $hits[$a] += ($base + $p)
          $p = $s.IndexOf($a, $p + $a.Length, [StringComparison]::Ordinal)
        }
      }
      $s = $null
    }
  }
  $next = $base + $size
  if ($next -le [int64]$addr) { break }
  $addr = [IntPtr]$next
}

Write-Output ("Gescannt: $regions Regionen ({0} MB) in {1}s" -f `
              [math]::Round($scanned/1MB), [math]::Round($sw.Elapsed.TotalSeconds,1))
Write-Output ""

# --- Durchgang 2: gefundene Stellen ausmessen ---
foreach ($a in $ANCHORS) {
  Write-Output "=== $a ==="
  if ($hits[$a].Count -eq 0) {
    Write-Output "  NICHT GEFUNDEN - kommt im Heap nicht als Klartext vor."
    Write-Output ""
    continue
  }
  foreach ($at in $hits[$a]) {
    $m = Measure-Slice $h $at
    $sib = Get-Siblings $h $m.Start $m.Total
    $sibNames = @($SIBLINGS | Where-Object { $sib.ContainsKey($_) })
    Write-Output ("  0x{0}  Lauf {1} KB (rueckw. {2}, vorw. {3})" -f `
                  ([int64]$at).ToString('X'), [math]::Round($m.Total/1KB,1), $m.Bwd, $m.Fwd)
    # $(if ...) als Unterausdruck - ein blosses (if ...) ist in 5.1 ein Parserfehler.
    $sibText = $(if ($sibNames.Count) { $sibNames -join ', ' } else { 'keine' })
    Write-Output ("     Geschwister {0}/{1}: {2}" -f $sibNames.Count, $SIBLINGS.Count, $sibText)
    $ctx = Read-Text $h ([int64]$at - 60) 200
    if ($null -ne $ctx) { Write-Output ("     Umfeld      {0}" -f (Scrub $ctx)) }
  }
  Write-Output ""
}

[void][MemG]::CloseHandle($h)
Write-Output "--- Deutung ---"
Write-Output "  Geschwister hoch  => selbes Inventardokument, nur anderer Ausschnitt - erreichbar."
Write-Output "  Geschwister keine => andere Antwort, hilft fuer das Inventar nicht."
Write-Output "  NICHT GEFUNDEN    => kommt nie im Klartext an, auf diesem Weg unerreichbar."
