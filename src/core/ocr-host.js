/**
 * Der Draht zum Texterkennungs-Dauerlaeufer (tools/ocr-host.ps1).
 *
 * WARUM ES DIESES MODUL GIBT:
 *   Vorher startete jede Aufnahme einen eigenen PowerShell-Prozess. Von den
 *   1,2 Sekunden, die das kostete, entfielen 116 ms auf die Erkennung - der
 *   Rest war Anlauf. Auf dem Belohnungsbildschirm laeuft eine Uhr, und in den
 *   15 Sekunden soll mehrfach hingesehen werden koennen. Also faellt der
 *   Anlauf einmal an: ein Prozess, viele Aufnahmen.
 *
 * LEBENSDAUER:
 *   Der Prozess startet beim ersten Blick - oder frueher, wenn warmUp() ihn
 *   vorzieht, weil die Reliktauswahl aufgegangen ist und der
 *   Belohnungsbildschirm in ein paar Minuten kommt. Er endet von selbst, wenn
 *   eine Weile niemand mehr etwas wollte: ein PowerShell-Prozess, der still
 *   neben dem Spiel steht, ist nichts, was man ungefragt dauerhaft laufen
 *   laesst.
 *
 * FEHLERHALTUNG:
 *   Faellt der Prozess aus, gilt das nur fuer den laufenden Blick. Der
 *   naechste Aufruf startet ihn neu. Ein haengender Blick wird nach
 *   REQUEST_TIMEOUT_MS abgebrochen und der Prozess verworfen - eine Antwort,
 *   die nach der Bedenkzeit kommt, ist keine Antwort mehr.
 */
import { spawn } from 'node:child_process';
import { resourceFile } from './paths.js';

const SCRIPT = () => resourceFile('tools', 'ocr-host.ps1');

/* Startet der Prozess in dieser Zeit nicht, stimmt etwas Grundsaetzliches
   nicht - fehlende Sprache, gesperrtes PowerShell. Weiter warten hilft nicht. */
const START_TIMEOUT_MS = 8000;

/* Eine Aufnahme dauert warm 70-250 ms. Zwei Sekunden sind kein Grenzfall
   mehr, sondern ein Hinweis darauf, dass der Prozess haengt. */
const REQUEST_TIMEOUT_MS = 4000;

/* So lange bleibt der Prozess nach dem letzten Blick noch stehen. Grosszuegig
   genug fuer eine Endlos-Mission, in der alle paar Minuten ein Relikt
   aufgeht - und kurz genug, dass er nach dem Spielen nicht uebrig bleibt. */
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

let proc = null;
let ready = null;              // Promise, solange der Start laeuft
let nextId = 1;
const pending = new Map();     // id -> { resolve, timer }
let idleTimer = null;
let buffer = '';
let language = null;
let startError = null;
/* Wie der Dauerlaeufer den Desktop sieht - aus seiner Startmeldung. Nur zur
   Diagnose: weicht seine Sicht von der des Hauptprozesses ab, sitzt jeder
   mitgeschickte Fensterrahmen daneben, und ohne diese Zahlen waere das
   nirgends nachzuvollziehen. */
let hostScreen = null;

function clearIdle() {
  clearTimeout(idleTimer);
  idleTimer = null;
}

function armIdle() {
  clearIdle();
  /* unref: dieser Wecker darf Electron nicht am Beenden hindern. */
  idleTimer = setTimeout(() => stop(), IDLE_TIMEOUT_MS);
  idleTimer.unref?.();
}

/** Alles Wartende mit demselben Fehler abraeumen und den Prozess vergessen. */
function teardown(reason) {
  const dead = proc;
  proc = null;
  ready = null;
  buffer = '';
  language = null;
  startError = null;
  hostScreen = null;
  clearIdle();

  for (const [, entry] of pending) {
    clearTimeout(entry.timer);
    entry.resolve({ ok: false, error: reason });
  }
  pending.clear();

  if (dead && !dead.killed) {
    try { dead.stdin.end(); } catch { /* schon zu */ }
    try { dead.kill(); } catch { /* schon weg */ }
  }
}

function handleLine(line) {
  const text = line.trim();
  if (!text) return;

  let msg;
  try {
    msg = JSON.parse(text);
  } catch {
    /* Keine Protokollzeile - PowerShell schreibt gelegentlich etwas dazwischen.
       Fuer die Antwortzuordnung ist sie wertlos, also weg damit. */
    return;
  }

  /* Die Startmeldung. ready:false heisst, dass gar keine Erkennungssprache da
     ist - der Grund gehoert weitergereicht, sonst steht spaeter nur
     "beendet" im Protokoll und niemand weiss, was zu tun waere. */
  if ('ready' in msg) {
    language = msg.ready ? (msg.language || null) : null;
    startError = msg.ready ? null : (msg.error || 'Keine OCR-Sprache installiert');
    hostScreen = msg.ready
      ? { virtual: msg.screen || null, primary: msg.primary || null, dpiAware: !!msg.dpiAware }
      : null;
    return;
  }

  const entry = pending.get(msg.id);
  if (!entry) return;
  pending.delete(msg.id);
  clearTimeout(entry.timer);
  entry.resolve(msg);
}

/**
 * Den Prozess starten und warten, bis er sich meldet.
 *
 * Die Startmeldung ist nicht Zierde: erst mit ihr steht fest, dass eine
 * Erkennungssprache installiert ist. Ohne sie waere jeder Blick ein Fehlblick,
 * und der Grund stuende nirgends.
 *
 * EIN MISSLUNGENER START WIRD NICHT GEMERKT: das Versprechen bleibt nur
 * liegen, wenn es aufgegangen ist. Sonst haette ein einziger Fehlstart - der
 * Rechner haengt gerade am Spielstart - die Erkennung fuer den Rest des Abends
 * abgeschaltet, ohne dass ein zweiter Versuch je stattgefunden haette.
 */
function start() {
  if (ready) return ready;

  const attempt = new Promise(resolve => {
    let settled = false;
    const done = res => { if (!settled) { settled = true; resolve(res); } };

    let child;
    try {
      child = spawn('powershell', [
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT()
      ], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (err) {
      return done({ ok: false, error: err.message });
    }

    proc = child;
    child.stdout.setEncoding('utf8');

    const timer = setTimeout(() => {
      teardown('Texterkennung startet nicht');
      done({ ok: false, error: 'Texterkennung startet nicht' });
    }, START_TIMEOUT_MS);
    timer.unref?.();

    child.stdout.on('data', chunk => {
      buffer += chunk;
      /* Antworten sind zeilenweise; ein Stueck kann mitten in einer Zeile
         enden. Der Rest bleibt bis zum naechsten Stueck liegen. */
      const parts = buffer.split(/\r?\n/);
      buffer = parts.pop() ?? '';
      for (const part of parts) {
        handleLine(part);
        if (language)   { clearTimeout(timer); done({ ok: true, language }); }
        if (startError) { clearTimeout(timer); done({ ok: false, error: startError }); }
      }
    });

    /* stderr ist beim Dauerlaeufer reine Diagnose. Ungelesen liefe der Puffer
       irgendwann voll und der Prozess bliebe stehen. */
    child.stderr.on('data', () => {});

    child.on('error', err => {
      clearTimeout(timer);
      teardown(err.message);
      done({ ok: false, error: err.message });
    });

    child.on('exit', () => {
      clearTimeout(timer);
      if (proc === child) teardown(startError || 'Texterkennung beendet');
      done({ ok: false, error: startError || 'Texterkennung beendet' });
    });
  });

  ready = attempt;
  /* Nur ein gelungener Start bleibt gemerkt - siehe oben. Der Vergleich haelt
     einen spaeteren, erfolgreichen Start davon ab, sich selbst zu loeschen. */
  attempt.then(res => { if (!res.ok && ready === attempt) ready = null; });
  return attempt;
}

/** Sieht ein Rahmen aus, als liesse sich daraus etwas aufnehmen? */
function usableRect(r) {
  return !!r && [r.x, r.y, r.w, r.h].every(Number.isFinite) && r.w >= 64 && r.h >= 64;
}

/**
 * Eine Aufnahme auswerten.
 *
 * rect ist der RAHMEN, auf den sich alle Anteile beziehen - in echten
 * Bildschirmpixeln. Gemeint ist damit das Spielfenster. Ohne rect bleibt es
 * beim Hauptbildschirm, und dann greifen die Anteile auf dem zweiten Monitor
 * oder im Fenstermodus daneben.
 *
 * top/bottom schneiden einen waagerechten Streifen aus, left/right einen
 * senkrechten - je als Anteil des Rahmens. Ohne Angabe: der ganze Rahmen.
 *
 * scale vergroessert die Aufnahme vor der Erkennung. Die Rahmen kommen
 * trotzdem in echten Bildschirmpixeln zurueck - der Dauerlaeufer rechnet sie
 * vor der Antwort herunter. Wozu das gut ist, steht im Kopf von ocr-host.ps1.
 */
export async function recognise({ top, bottom, left, right, rect, source, png, scale } = {}) {
  const started = await start();
  if (!started.ok) return started;
  if (!proc) return { ok: false, error: 'Texterkennung nicht erreichbar' };

  clearIdle();

  const id = nextId++;
  const req = { id };
  if (Number.isFinite(top))    req.top = top;
  if (Number.isFinite(bottom)) req.bottom = bottom;
  if (Number.isFinite(left))   req.left = left;
  if (Number.isFinite(right))  req.right = right;
  /* Ein unbrauchbarer Rahmen wird weggelassen und nicht durchgereicht: dann
     faellt der Dauerlaeufer auf den Hauptbildschirm zurueck, statt in eine
     leere Flaeche zu lesen. */
  if (usableRect(rect)) {
    req.rect = { x: Math.round(rect.x), y: Math.round(rect.y),
                 w: Math.round(rect.w), h: Math.round(rect.h) };
  }
  /* Nur mitschicken, wenn wirklich vergroessert werden soll: eine 1 im
     Protokoll waere Rauschen, und aeltere Dauerlaeufer wuerden sie ignorieren. */
  if (Number.isFinite(scale) && scale > 1) req.scale = scale;
  if (source) req.source = source;
  if (png)    req.png = png;

  const answer = new Promise(resolve => {
    const timer = setTimeout(() => {
      pending.delete(id);
      /* Ein haengender Prozess antwortet auch beim naechsten Mal nicht. */
      teardown('Texterkennung antwortet nicht');
      resolve({ ok: false, error: 'Texterkennung antwortet nicht' });
    }, REQUEST_TIMEOUT_MS);
    timer.unref?.();
    pending.set(id, { resolve, timer });
  });

  try {
    proc.stdin.write(JSON.stringify(req) + '\n');
  } catch (err) {
    const entry = pending.get(id);
    if (entry) { clearTimeout(entry.timer); pending.delete(id); }
    teardown(err.message);
    return { ok: false, error: err.message };
  }

  const res = await answer;
  armIdle();
  return res;
}

/**
 * Den Prozess vorziehen, ohne schon etwas zu wollen.
 *
 * Aufgerufen, wenn die Reliktauswahl aufgeht: dann steht fest, dass eine
 * Rissmission bevorsteht, und der Anlauf faellt in eine Zeit, in der niemand
 * darauf wartet - statt in die 15 Sekunden Bedenkzeit.
 */
export async function warmUp() {
  const res = await start();
  if (res.ok) armIdle();
  return res;
}

export function stop() {
  teardown('Texterkennung beendet');
}

export function ocrLanguage() {
  return language;
}

/**
 * Wie der Dauerlaeufer den Desktop sieht, oder null.
 *
 * { virtual: {x,y,w,h}, primary: {x,y,w,h}, dpiAware: bool }
 *
 * Gedacht fuer eine einzige Frage: stimmt seine Sicht mit der des
 * Hauptprozesses ueberein? Tut sie es nicht, sind alle mitgeschickten
 * Fensterrahmen im falschen Massstab - und das faellt sonst nirgends auf.
 */
export function ocrScreen() {
  return hostScreen;
}
