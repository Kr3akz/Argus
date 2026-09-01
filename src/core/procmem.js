/**
 * Lesender Zugriff auf den Speicher eines fremden Prozesses (Windows x64).
 *
 * Duenner Wrapper um vier kernel32-Funktionen - alles Warframe-Spezifische steht
 * in gamecreds.js. Der Zugriff ist ausschliesslich lesend: das Handle wird mit
 * PROCESS_VM_READ | PROCESS_QUERY_INFORMATION geoeffnet, WriteProcessMemory ist
 * nicht eingebunden. Es gibt keinen Schreibpfad in diesem Modul.
 *
 * Adressen laufen als BigInt. Windows-Nutzeradressen bleiben zwar unter 2^47 und
 * damit im sicheren Number-Bereich, aber sobald man sie mit Regionsgroessen
 * verrechnet, sind stille Rundungsfehler nur eine Frage der Zeit. koffi liefert
 * uint64 je nach Groesse als Number oder BigInt - big() normalisiert beides.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/* Zugriffsrechte und Speicherflags aus winnt.h */
const PROCESS_VM_READ           = 0x0010;
const PROCESS_QUERY_INFORMATION = 0x0400;
const MEM_COMMIT                = 0x1000;
const MEM_PRIVATE               = 0x20000;
const PAGE_READWRITE            = 0x04;
const PAGE_EXECUTE_READWRITE    = 0x40;
const PAGE_GUARD                = 0x100;

const ERROR_PARTIAL_COPY = 299;

/* Grenzen fuer die Regionsauswahl. Gemessen an einem laufenden Client: 14965
   Regionen mit 5562 MB passen durch diesen Filter. */
const MIN_REGION = 4096n;
const MAX_REGION = 128n * 1024n * 1024n;

/* Trennlinie zwischen "kleinen" und "grossen" Regionen, siehe findPattern().
   Von den 5562 MB stecken 3932 MB in nur 125 Regionen oberhalb dieser Grenze. */
const SMALL_REGION = 4n * 1024n * 1024n;

/* Lesehaeppchen. Ein wiederverwendeter Puffer statt einer Allokation je Region -
   sonst wandern bei 2000 Regionen mehrere GB durch den Garbage Collector. */
const CHUNK = 4 * 1024 * 1024;

function fail(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

let api = null;

/** Laedt koffi und bindet kernel32 - beim ersten Aufruf, danach gecacht. */
function kernel32() {
  if (api) return api;

  let koffi;
  try {
    koffi = require('koffi');
  } catch {
    throw fail('koffi_missing', 'koffi is not installed (npm install koffi).');
  }

  /* Layout von MEMORY_BASIC_INFORMATION unter x64: 48 Byte inklusive der beiden
     Fuellfelder, die der Compiler zum Ausrichten der 64-Bit-Felder einzieht.
     Ohne diese Felder rutscht alles ab AllocationProtect um vier Byte. */
  koffi.struct('MEMORY_BASIC_INFORMATION', {
    BaseAddress:       'uint64',
    AllocationBase:    'uint64',
    AllocationProtect: 'uint32',
    __align1:          'uint32',
    RegionSize:        'uint64',
    State:             'uint32',
    Protect:           'uint32',
    Type:              'uint32',
    __align2:          'uint32'
  });

  /* Zeigerparameter sind als uint64 deklariert statt als void* - dadurch koennen
     wir Adressen direkt als BigInt hinein- und herausreichen, ohne koffis
     Zeigerobjekte zu verpacken. Unter x64 ist das ABI-identisch. */
  const lib = koffi.load('kernel32.dll');
  api = {
    OpenProcess: lib.func(
      'uint64 __stdcall OpenProcess(uint32 dwDesiredAccess, bool bInheritHandle, uint32 dwProcessId)'),
    VirtualQueryEx: lib.func(
      'uint64 __stdcall VirtualQueryEx(uint64 hProcess, uint64 lpAddress, _Out_ MEMORY_BASIC_INFORMATION *lpBuffer, uint64 dwLength)'),
    ReadProcessMemory: lib.func(
      'bool __stdcall ReadProcessMemory(uint64 hProcess, uint64 lpBaseAddress, _Out_ uint8_t *lpBuffer, uint64 nSize, _Out_ uint64 *lpNumberOfBytesRead)'),
    CloseHandle: lib.func(
      'bool __stdcall CloseHandle(uint64 hObject)'),
    GetLastError: lib.func(
      'uint32 __stdcall GetLastError()')
  };
  return api;
}

const big = v => (typeof v === 'bigint' ? v : BigInt(v));

/** Laeuft der Speicherzugriff auf dieser Plattform ueberhaupt? */
export function isSupported() {
  return process.platform === 'win32' && process.arch === 'x64';
}

/**
 * Oeffnet einen Prozess nur zum Lesen.
 * Wirft mit code 'open_failed'; detail traegt den Win32-Fehlercode (5 = Zugriff verweigert).
 */
export function openProcess(pid) {
  if (!isSupported()) throw fail('unsupported', 'Memory access only works on Windows x64.');
  const k = kernel32();
  const handle = k.OpenProcess(PROCESS_VM_READ | PROCESS_QUERY_INFORMATION, false, pid);
  if (!handle) {
    const code = k.GetLastError();
    const err = fail('open_failed', `OpenProcess failed (Win32 error ${code}).`);
    err.detail = code;
    throw err;
  }
  return handle;
}

export function closeHandle(handle) {
  if (handle) kernel32().CloseHandle(handle);
}

/**
 * Liest in einen vorhandenen Puffer und liefert die gelesene Byteanzahl.
 *
 * Ein Fehlschlag ist hier der Normalfall, nicht die Ausnahme: liegt in der Region
 * eine nicht lesbare Seite, meldet Windows ERROR_PARTIAL_COPY und schreibt trotzdem
 * die bis dahin gelesenen Bytes. Die nehmen wir mit, statt die Region zu verwerfen.
 */
export function readInto(handle, address, buffer, length) {
  const k = kernel32();
  const read = [0n];
  const ok = k.ReadProcessMemory(handle, big(address), buffer, BigInt(length), read);
  const got = Number(read[0]);
  if (!ok && !(k.GetLastError() === ERROR_PARTIAL_COPY && got > 0)) return 0;
  return Math.min(got, length);
}

/** Liest einen kleinen Ausschnitt in einen frischen Puffer. null, wenn nichts lesbar war. */
export function readAt(handle, address, length) {
  const buf = Buffer.allocUnsafe(length);
  const got = readInto(handle, address, buf, length);
  if (got <= 0) {
    buf.fill(0);
    return null;
  }
  return buf.subarray(0, got);
}

/**
 * Laeuft den Adressraum ab und liefert nur die Regionen, in denen Heap-Daten liegen
 * koennen: belegt, privat, beschreibbar, nicht wachgeschuetzt. Code und gemappte
 * Assets fallen damit weg - das ist der Filter, der den Scan von Minuten auf
 * Sekunden bringt.
 *
 * PAGE_WRITECOPY bleibt bewusst draussen: der verifizierte Lauf hat mit
 * PAGE_READWRITE und PAGE_EXECUTE_READWRITE gefunden, was gesucht war, und jede
 * zusaetzliche Schutzklasse vergroessert nur die Scanmenge.
 */
export function* heapRegions(handle, { minSize = MIN_REGION, maxSize = MAX_REGION } = {}) {
  const k = kernel32();
  let address = 0n;

  for (;;) {
    const mbi = {};
    if (!k.VirtualQueryEx(handle, address, mbi, 48n)) return;

    const base = big(mbi.BaseAddress);
    const size = big(mbi.RegionSize);
    if (size <= 0n) return;

    const writable = (mbi.Protect & PAGE_READWRITE) || (mbi.Protect & PAGE_EXECUTE_READWRITE);
    if (mbi.State === MEM_COMMIT && mbi.Type === MEM_PRIVATE &&
        writable && !(mbi.Protect & PAGE_GUARD) &&
        size >= minSize && size <= maxSize) {
      yield { base, size };
    }

    const next = base + size;
    if (next <= address) return;   // Ueberlauf oder Stillstand - Abbruch statt Endlosschleife
    address = next;
  }
}

/**
 * Durchsucht die uebergebenen Regionen. Interner Kern von findPattern().
 *
 * Die Suche laeuft ueber Buffer.indexOf, also nativen Code. Eine JS-Schleife ueber
 * einzelne Bytes waere um Groessenordnungen langsamer und bei Gigabytes nicht
 * praktikabel - dasselbe Problem, das im PowerShell-Test String.IndexOf geloest hat.
 *
 * Zwischen zwei Haeppchen und zwei aneinandergrenzenden Regionen wird die Naht
 * mitgesucht, damit ein Treffer genau auf der Grenze nicht verlorengeht.
 */
function scanRegions(handle, pattern, source, limit, deadline) {
  const overlap = pattern.length - 1;
  const buffer = Buffer.allocUnsafe(CHUNK);
  const carry = Buffer.alloc(overlap);

  const addresses = [];
  let regions = 0, bytes = 0, timedOut = false;
  let carryEnd = -1n;                       // Adresse direkt hinter dem letzten Haeppchen

  outer:
  for (const region of source) {
    regions++;
    for (let offset = 0n; offset < region.size; offset += BigInt(CHUNK)) {
      if (Date.now() > deadline) { timedOut = true; break outer; }

      const remaining = region.size - offset;
      const want = Number(remaining > BigInt(CHUNK) ? BigInt(CHUNK) : remaining);
      const start = region.base + offset;
      const got = readInto(handle, start, buffer, want);
      if (got <= 0) { carryEnd = -1n; continue; }

      bytes += got;
      const view = buffer.subarray(0, got);

      // Naht zum vorherigen Haeppchen, nur wenn es lueckenlos anschliesst
      if (overlap > 0 && carryEnd === start) {
        const seam = Buffer.concat([carry, view.subarray(0, Math.min(overlap, got))]);
        let p = seam.indexOf(pattern);
        while (p >= 0 && p < overlap) {
          addresses.push(start - BigInt(overlap - p));
          if (addresses.length >= limit) break outer;
          p = seam.indexOf(pattern, p + 1);
        }
        seam.fill(0);
      }

      let p = view.indexOf(pattern);
      while (p >= 0) {
        addresses.push(start + BigInt(p));
        if (addresses.length >= limit) break outer;
        p = view.indexOf(pattern, p + 1);
      }

      /* Nahtpuffer nachziehen. Bei einem zu kurzen Lesevorgang laege der Rest
         linksbuendig und die Adressrechnung oben stimmte nicht mehr - dann lieber
         die Naht verwerfen, als eine falsche Adresse zu melden. */
      if (overlap > 0 && got >= overlap) {
        view.subarray(got - overlap).copy(carry);
        carryEnd = start + BigInt(got);
      } else {
        carryEnd = -1n;
      }
    }
  }

  /* Die Puffer haben fremden Prozessspeicher gesehen - nicht als Muell liegenlassen. */
  buffer.fill(0);
  carry.fill(0);

  return { addresses, regions, bytes, timedOut };
}

/**
 * Sucht ein ASCII-Muster im Heap und liefert die Fundadressen.
 *
 * ZWEI DURCHGAENGE, kleine Regionen zuerst. Gemessen an einem laufenden Client:
 * die 125 Regionen ueber 4 MB machen 3932 der 5562 MB aus und enthalten keine
 * URL-Puffer - dort liegen Assets. Die Zugangsdaten stecken in kleinen
 * Heap-Bloecken (gefunden in 0,19 und 0,38 MB grossen Regionen).
 *
 * Der zweite Durchgang laeuft nur, wenn der erste leer ausgeht. Das haelt den
 * Normalfall bei rund einem Viertel der Datenmenge, ohne dass wir blind werden,
 * falls DE das Allokationsverhalten aendert.
 *
 * Nebeneffekt, der genauso zaehlt: die grossen Regionen sind meist ausgelagert.
 * Sie zu lesen holt sie aus der Auslagerungsdatei zurueck und drueckt dem
 * laufenden Spiel Speicher rein, den es gerade nicht braucht.
 */
export function findPattern(handle, needle, { limit = 16, maxSeconds = 60 } = {}) {
  const pattern = Buffer.from(needle, 'latin1');
  const started = Date.now();
  const deadline = started + maxSeconds * 1000;
  const done = (r, pass) => ({
    ...r, pass, seconds: (Date.now() - started) / 1000
  });

  const small = scanRegions(handle, pattern,
    heapRegions(handle, { maxSize: SMALL_REGION }), limit, deadline);
  if (small.addresses.length || small.timedOut) return done(small, 'klein');

  const large = scanRegions(handle, pattern,
    heapRegions(handle, { minSize: SMALL_REGION + 1n }), limit, deadline);
  return done({
    addresses: large.addresses,
    regions:   small.regions + large.regions,
    bytes:     small.bytes + large.bytes,
    timedOut:  large.timedOut
  }, 'vollstaendig');
}
