# Machbarkeitstest fuer den Inventar-Zugriff. NUR LESEND.
#
#   A) Liegt der Inventar-JSON als Klartext im Speicher?  -> Marker RawUpgrades / SuitBin
#   B) Sind die API-Credentials auffindbar?               -> Marker ?accountId=
#
# Die Suche laeuft ueber String.IndexOf (nativer .NET-Code) statt einer PowerShell-Schleife -
# byteweise Iteration in PS schafft nur wenige MB/s und kommt bei mehreren GB nie durch.
#
# Das Skript gibt gefundene Zugangsdaten NICHT aus - nur ob und wo das Muster liegt.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File memscan.ps1

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Mem {
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

$proc = Get-Process -Name "Warframe.x64" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $proc) { Write-Output "Warframe laeuft nicht - bitte starten und einloggen."; exit 1 }
Write-Output "Prozess: PID $($proc.Id), WorkingSet $([math]::Round($proc.WorkingSet64/1MB)) MB"

$h = [Mem]::OpenProcess((0x0010 -bor 0x0400), $false, $proc.Id)
if ($h -eq [IntPtr]::Zero) {
  Write-Output "OpenProcess fehlgeschlagen (Fehler $([Runtime.InteropServices.Marshal]::GetLastWin32Error())). Bei 5: als Administrator starten."
  exit 1
}

# Latin1 bildet Bytes 1:1 auf Zeichen ab - so findet IndexOf ASCII-Muster im Rohspeicher.
$enc = [Text.Encoding]::GetEncoding(28591)
$markers = [ordered]@{
  "?accountId=" = "B: API-Credentials"
  "RawUpgrades" = "A: Inventar-JSON (Mods)"
  "SuitBin"     = "A: Inventar-JSON (Slots)"
}
$found = @{}
foreach ($m in $markers.Keys) { $found[$m] = 0 }

$MEM_COMMIT = 0x1000; $MEM_PRIVATE = 0x20000
$addr = [IntPtr]::Zero
$mbiSize = [Runtime.InteropServices.Marshal]::SizeOf([type][Mem+MEMORY_BASIC_INFORMATION])
$scanned = 0; $regions = 0; $skipped = 0
$sw = [Diagnostics.Stopwatch]::StartNew()
$maxSeconds = 300

Write-Output "Handle offen. Scanne private Heap-Regionen (max $($maxSeconds)s)..."
Write-Output ""

while ($sw.Elapsed.TotalSeconds -lt $maxSeconds) {
  $mbi = New-Object Mem+MEMORY_BASIC_INFORMATION
  if ([Mem]::VirtualQueryEx($h, $addr, [ref]$mbi, [IntPtr]$mbiSize) -eq [IntPtr]::Zero) { break }
  $size = [int64]$mbi.RegionSize
  if ($size -le 0) { break }

  $prot = $mbi.Protect
  # Nur beschreibbare, private, committed Regionen - dort liegen Heap-Daten.
  # Read-only und gemappte Bereiche (Code, Assets) koennen wir uebergehen.
  $isHeap = ($mbi.State -eq $MEM_COMMIT) -and ($mbi.Type -eq $MEM_PRIVATE) -and
            (($prot -band 0x04) -or ($prot -band 0x40)) -and -not ($prot -band 0x100)

  if ($isHeap -and $size -ge 4096 -and $size -le 128MB) {
    $buf = New-Object byte[] $size
    $read = [IntPtr]::Zero
    if ([Mem]::ReadProcessMemory($h, $mbi.BaseAddress, $buf, [IntPtr]$size, [ref]$read)) {
      $n = [int]$read
      if ($n -gt 0) {
        $scanned += $n; $regions++
        $s = $enc.GetString($buf, 0, $n)
        foreach ($m in $markers.Keys) {
          if ($found[$m] -ge 2) { continue }
          $pos = $s.IndexOf($m, [StringComparison]::Ordinal)
          while ($pos -ge 0 -and $found[$m] -lt 2) {
            $found[$m]++
            Write-Output ("  TREFFER  {0,-24} bei 0x{1}" -f $markers[$m], ([int64]$mbi.BaseAddress + $pos).ToString('X'))
            $pos = $s.IndexOf($m, $pos + $m.Length, [StringComparison]::Ordinal)
          }
        }
        $s = $null
      }
    }
    $buf = $null
  } else { $skipped++ }

  $next = [int64]$mbi.BaseAddress + $size
  if ($next -le [int64]$addr) { break }
  $addr = [IntPtr]$next

  # Frueh raus, sobald alles Gesuchte gefunden ist
  if ($found["?accountId="] -ge 1 -and ($found["RawUpgrades"] -ge 1 -or $found["SuitBin"] -ge 1)) { break }
}

[void][Mem]::CloseHandle($h)
Write-Output ""
Write-Output "Gescannt: $regions Regionen ($([math]::Round($scanned/1MB)) MB), $skipped uebersprungen, $([math]::Round($sw.Elapsed.TotalSeconds,1))s"
Write-Output ""
Write-Output "--- Ergebnis ---"
if ($found["?accountId="] -gt 0) {
  Write-Output "  Variante B MACHBAR - Credentials im Speicher auffindbar."
} else {
  Write-Output "  Variante B: nicht gefunden."
}
if ($found["RawUpgrades"] -gt 0 -or $found["SuitBin"] -gt 0) {
  Write-Output "  Variante A MACHBAR - Inventar-JSON liegt im Klartext."
} else {
  Write-Output "  Variante A: nicht gefunden."
}
