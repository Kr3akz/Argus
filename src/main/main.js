/**
 * Electron-Hauptprozess.
 *
 * SICHERHEIT:
 *   - Lesender Zugriff auf den Warframe-Prozess NUR fuer den Inventar-Abruf und
 *     nur auf Knopfdruck: procmem.js oeffnet den Prozess mit PROCESS_VM_READ und
 *     PROCESS_QUERY_INFORMATION, um die temporaeren API-Zugangsdaten zu lesen.
 *     Kein Schreibzugriff, keine Injektion, keine Veraenderung am Spiel.
 *     (Frueher galt hier "kein Kontakt zum Spielprozess" - das stimmt seit dem
 *     Inventar-Tab nicht mehr und waere ein irrefuehrender Kommentar.)
 *   - accountId und nonce bleiben im Hauptprozess: nicht geloggt, nicht
 *     gespeichert, nicht ueber preload.cjs erreichbar.
 *   - Netzwerkabruf von Profil und Inventar NUR auf Knopfdruck und nur durch
 *     dieselbe Drosselung (siehe ratelimit.js) - DE sperrt pro IP.
 *   - Renderer laeuft ohne Node-Zugriff (contextIsolation an).
 */
import { app, BrowserWindow, ipcMain, globalShortcut, shell, Notification, screen } from 'electron';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { loadCatalog, imageUrl, cleanGameText } from '../core/catalog.js';
import { loadProfile, displayName, starChart, isValidAccountId } from '../core/profile.js';
import { analyze, recommend, diversify, STATUS } from '../core/analyze.js';
import { masteryRankName, progressForMR } from '../core/mastery.js';
import { classify, CATEGORY_LABELS } from '../core/classify.js';
import { acquisitionOf } from '../core/acquisition.js';
import { resolveGoal, combineGoals, formatDuration, isRawMaterial } from '../core/recipes.js';
import { loadConfig, saveConfig, DEFAULT_HOTKEYS } from '../core/config.js';
import * as store from '../core/store.js';
import { loadMods, POLARITIES, RARITY_LABELS, searchMods, isAuraMod, isExilusMod } from '../core/mods.js';
import { evaluateBuild, combineBuilds, orokinTypeFor } from '../core/builds.js';
import { fetchWorldState } from '../core/worldstate.js';
import { getAllResourceGuides, searchResourceGuides } from '../core/farming.js';
import { getDucatsReferenceList, buildPrimeSets, buildDucatsCatalog, buildInventoryDucats } from '../core/ducats.js';
import { loadInventory } from '../core/inventory.js';
import { scanCredentials } from '../core/gamecreds.js';
import { buildInventory, SECTIONS } from '../core/inventory-items.js';
import { loadDropTables, sourcesFor } from '../core/droptables.js';
import { loadCardImages, cardUrl } from '../core/cards.js';
import { upgradeDetails } from '../core/upgrade-details.js';
import { checkAllowed, formatWait } from '../core/ratelimit.js';
import { matchesFissureFilter } from '../core/fissure-filter.js';
import { captureForeground, restoreForeground } from '../core/foreground.js';
import { LogWatcher } from '../core/logwatch.js';
import { loadMarketItems, findMarketItem, getPrice, getPrices } from '../core/market.js';
import {
  loadRelicTables, allRewardNames, planRelics, resolveInventoryRelic, relicIconPath,
  rewardsFor, relicExpectation, RELIC_STATES
} from '../core/relics.js';
import { scanRewardScreen, buildRewardIndex } from '../core/rewardscan.js';
import {
  parseBuildId, fetchBuild, toBuild, loadModMap, saveModMap,
  unknownModIds, mergeNames, USER_AGENT as OF_USER_AGENT
} from '../core/overframe.js';
import { setDataDir, setResourceDir, dataFile } from '../core/paths.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let win = null;

/* Das Overlay ist ein EIGENES Fenster, kein zweiter Zustand des Hauptfensters.
   Zuerst war es dasselbe Fenster, das die Gestalt wechselt - das hiess aber:
   wer das Overlay einblendet, verliert die volle Oberflaeche auf dem zweiten
   Monitor. Genau die soll waehrend des Spielens stehen bleiben. */
let overlayWin = null;

/* Klicks gehen ans Spiel durch, statt im Overlay zu landen. */
let clickThrough = false;
let overlayOpacity = 0.94;

/* Nur das Overlay merkt sich seine Lage; das Hauptfenster bleibt, wo es ist. */
let overlayBounds = null;
let layoutSaveTimer = null;

/* Relikt-Beobachtung: liest Warframes EE.log mit. Siehe core/logwatch.js. */
let logWatcher = null;
let relicAutoShow = true;
/* Bildschirmerkennung der vier Belohnungen. Abschaltbar, weil dafuer ein
   Bildschirmfoto entsteht - auch wenn es den Rechner nie verlaesst. */
let relicScan = true;
/* Preisschilder direkt im Spiel, unter den vier Karten. */
let relicTags = true;
let rewardIndex = null;
let tagWin = null;
let tagTimer = null;

/* Senkrechter Abstand der Preisschilder unter dem Namen, als Anteil der
   Bildschirmhoehe - so sitzt es auf 1080p wie auf 1440p an derselben Stelle
   des Bildes. 0.23 platziert die Karten mit reichlich Platz unter allen
   vier Spielernamen.
   Ueber data/config.json feinjustierbar, ohne dass es dafuer einen Schalter
   in der Oberflaeche braucht. */
let relicTagOffset = 0.23;
/* Nur ein selbst eingeblendetes Overlay wird danach auch selbst wieder
   ausgeblendet - wer es vorher offen hatte, soll es behalten. */
let overlayShownForRelic = false;
/* Der zuletzt gemeldete Fund. Das Overlay-Fenster entsteht oft erst, WEIL
   dieser Fund kam - eine Nachricht an ein Fenster, dessen Renderer noch laedt,
   verpufft. Deshalb wird der Stand hier gehalten und beim Start abgefragt. */
let currentRelic = null;

const WINDOW_SIZE  = { width: 1480, height: 880 };
const WINDOW_MIN   = { width: 1020, height: 620 };
const OVERLAY_SIZE = { width:  380, height: 600 };
const OVERLAY_MIN  = { width:  300, height: 260 };

/* Eine Quelle fuer Registrierung und Anzeige - sonst zeigt die Titelleiste
   irgendwann eine Taste, die gar nicht mehr registriert ist. Aenderbar zur
   Laufzeit ueber den Einstellungs-Tab, gespeichert in data/config.json. */
let hotkeys = { ...DEFAULT_HOTKEYS };

/* Zeigermodus: das Overlay holt sich kurz den Eingabefokus.
   Nicht die App macht den Mauszeiger sichtbar - Warframe haelt ihn gefangen,
   solange es im Vordergrund ist. Sobald ein anderes Fenster den Fokus
   bekommt, gibt Windows den Zeiger von selbst wieder frei. Genau das ist
   dieser Modus, und mehr braucht es nicht. */
let interacting = false;

/* Fenster, das vor dem Zeigermodus den Fokus hatte - im Spielbetrieb also
   Warframe. Nur eine Kennung, kein Zugriff auf den fremden Prozess. */
let interactReturnTo = null;
const cache = { catalog: null, profile: null, analysis: null, mods: null, dropTables: null, cards: null };

/* Wohin geschrieben wird - siehe core/paths.js.
   Im gepackten Build liegt der Programmordner unter Programme und gehoert
   nicht dem Nutzer; geschrieben wird deshalb nach %APPDATA%. Das hat einen
   zweiten Vorteil, der beim ersten Update sichtbar wird: Ziele, Builds und
   Notizen ueberstehen die neue Fassung, weil sie gar nicht erst im
   ausgetauschten Ordner liegen.
   In der Entwicklung bleibt es beim data/ des Projekts - sonst laege der
   Testbestand ploetzlich woanders als der, an dem gerade gearbeitet wird. */
if (app.isPackaged) {
  setDataDir(path.join(app.getPath('userData'), 'data'));
  setResourceDir(process.resourcesPath);   // extraResources: tools/ liegt daneben
}

function createWindow() {
  win = new BrowserWindow({
    width: WINDOW_SIZE.width, height: WINDOW_SIZE.height,
    minWidth: WINDOW_MIN.width, minHeight: WINDOW_MIN.height,
    backgroundColor: '#0d1117',
    frame: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  win.loadFile(path.join(__dirname, '../renderer/index.html'));
  win.once('ready-to-show', () => win.show());

  /* Ohne Hauptfenster hat das Overlay keinen Zweck. Und ein nur verstecktes
     Overlay wuerde app.quit() verhindern: die App liefe unsichtbar weiter,
     ohne Fenster und ohne Taskleisteneintrag. */
  win.on('closed', () => {
    win = null;
    if (overlayWin && !overlayWin.isDestroyed()) overlayWin.destroy();
    overlayWin = null;
    if (tagWin && !tagWin.isDestroyed()) tagWin.destroy();
    tagWin = null;
  });

  // Externe Links im echten Browser oeffnen, nicht in der App.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

/**
 * Standardplatz des Overlays: oben rechts auf dem PRIMAERbildschirm.
 *
 * Bewusst nicht auf dem Bildschirm, auf dem das Fenster gerade steht. Das
 * Hauptfenster gehoert auf den zweiten Monitor, das Overlay ueber das Spiel -
 * und das laeuft auf dem Hauptbildschirm. Wer es anders haben will, zieht es
 * einmal hin; ab dann gilt die gemerkte Position.
 */
function defaultOverlayBounds() {
  const area = screen.getPrimaryDisplay().workArea;
  const height = Math.min(OVERLAY_SIZE.height, area.height - 96);
  return {
    width:  OVERLAY_SIZE.width,
    height,
    x: area.x + area.width - OVERLAY_SIZE.width - 24,
    y: area.y + 64
  };
}

/**
 * Gemerkte Position nur uebernehmen, wenn sie noch auf einem angeschlossenen
 * Bildschirm liegt. Sonst taucht das Overlay nach dem Abstecken des zweiten
 * Monitors ausserhalb jedes sichtbaren Bereichs auf und ist nur noch ueber
 * den Hotkey erreichbar.
 */
function usableBounds(b) {
  if (!b || !Number.isFinite(b.x) || !Number.isFinite(b.y)) return null;
  const onScreen = screen.getAllDisplays().some(d => {
    const a = d.workArea;
    return b.x < a.x + a.width && b.x + b.width > a.x
        && b.y < a.y + a.height && b.y + b.height > a.y;
  });
  return onScreen ? b : null;
}

/* Unter 35 % ist das Overlay auf hellem Spielhintergrund nicht mehr lesbar -
   und ein unsichtbares Fenster, das trotzdem Klicks faengt, waere eine Falle. */
const clampOpacity = v => Math.min(1, Math.max(0.35, Number(v) || 0.94));

/* Position, Deckkraft und Klick-Durchlass ueberleben den Neustart. Gebuendelt,
   weil beim Ziehen des Fensters Dutzende Ereignisse pro Sekunde kommen. */
function rememberOverlayLayout() {
  clearTimeout(layoutSaveTimer);
  layoutSaveTimer = setTimeout(async () => {
    try {
      const cfg = await loadConfig();
      await saveConfig({ ...cfg, overlayBounds, overlayOpacity, overlayClickThrough: clickThrough, relicAutoShow, relicScan, relicTags });
    } catch {
      /* Eine nicht gespeicherte Fensterposition ist ein Schoenheitsfehler,
         kein Grund, irgendetwas anderes anzuhalten. */
    }
  }, 800);
}

/* Was das jeweilige Kuerzel ausloest. Eine Stelle, damit Erstregistrierung
   und spaetere Aenderung nicht auseinanderlaufen koennen. */
const HOTKEY_ACTIONS = {
  /* Schaltet nur das Overlay. Das Hauptfenster bleibt unberuehrt - es steht
     auf dem zweiten Monitor und soll waehrend des Spielens offen bleiben. */
  overlay:  () => toggleOverlay(),
  /* Holt den Mauszeiger ins Overlay und wieder zurueck ins Spiel. Eine Taste
     und keine Maustaste: globalShortcut kennt nur Tastatur. */
  interact: () => setInteracting(!interacting)
};

/* register() wirft bei ungueltigen Zeichenfolgen, statt false zu liefern -
   und eine Zeichenfolge kommt hier aus der Oberflaeche. */
function tryRegister(accelerator, action) {
  if (!accelerator) return false;
  try {
    return globalShortcut.register(accelerator, action);
  } catch {
    return false;
  }
}

/**
 * Registriert die globalen Tastenkuerzel neu und meldet, was nicht ging.
 *
 * Windows vergibt eine Kombination nur einmal systemweit. Ist sie schon
 * belegt - Discord, GeForce Experience, ein anderes Overlay -, liefert
 * register() false. Dann gilt weiter das vorherige Kuerzel: lieber ein altes
 * als gar keines, und die Oberflaeche kann sagen warum.
 */
function applyHotkeys(next = {}) {
  const wanted = { ...hotkeys, ...next };
  const failed = [];

  globalShortcut.unregisterAll();

  for (const name of Object.keys(HOTKEY_ACTIONS)) {
    const accelerator = String(wanted[name] || '').trim();
    if (tryRegister(accelerator, HOTKEY_ACTIONS[name])) {
      hotkeys[name] = accelerator;
      continue;
    }
    failed.push({ name, accelerator });
    tryRegister(hotkeys[name], HOTKEY_ACTIONS[name]);
  }

  return { hotkeys: { ...hotkeys }, failed };
}

async function loadOverlayPrefs() {
  try {
    const cfg = await loadConfig();
    if (cfg.hotkeys) hotkeys = { ...DEFAULT_HOTKEYS, ...cfg.hotkeys };
    if (typeof cfg.relicAutoShow === 'boolean') relicAutoShow = cfg.relicAutoShow;
    if (typeof cfg.relicScan === 'boolean') relicScan = cfg.relicScan;
    if (typeof cfg.relicTags === 'boolean') relicTags = cfg.relicTags;
    if (Number.isFinite(cfg.relicTagOffset)) {
      /* Zwischen 0 und einem Drittel der Hoehe - alles andere schoebe die
         Schilder aus dem Bild. */
      relicTagOffset = Math.min(0.33, Math.max(0, cfg.relicTagOffset));
    }
    if (Number.isFinite(cfg.overlayOpacity)) overlayOpacity = clampOpacity(cfg.overlayOpacity);
    if (cfg.overlayBounds) overlayBounds = cfg.overlayBounds;
    clickThrough = !!cfg.overlayClickThrough;
  } catch {
    /* Ohne Konfiguration gelten die Voreinstellungen. */
  }
}

/**
 * Klicks an das Spiel durchreichen.
 *
 * forward: true ist der entscheidende Teil: ohne das kaeme keine Mausbewegung
 * mehr im Renderer an, und das Overlay koennte nicht bemerken, dass der Zeiger
 * wieder darueber steht. Der Renderer meldet genau das ueber window:hover
 * zurueck - sonst waere der Durchlass eine Einbahnstrasse, die sich nur noch
 * per Hotkey aufheben liesse.
 */
function applyMousePassthrough(ignore) {
  if (!overlayWin || overlayWin.isDestroyed()) return;
  overlayWin.setIgnoreMouseEvents(!!ignore, { forward: true });
}

/* Das Overlay laedt ein eigenes, schlankes Dokument statt index.html: es
   braucht weder Sidebar noch die acht Bereiche, und ein zweiter Renderer, der
   das ganze Dashboard aufbaut, waere waehrend des Spielens verschenkte Zeit. */
function createOverlayWindow() {
  overlayWin = new BrowserWindow({
    ...(usableBounds(overlayBounds) || defaultOverlayBounds()),
    minWidth: OVERLAY_MIN.width, minHeight: OVERLAY_MIN.height,
    title: 'Argus Overlay',
    backgroundColor: '#0b0f16',
    frame: false,
    show: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreenable: false,
    maximizable: false,
    minimizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  /* 'screen-saver' liegt ueber randlosen Vollbildfenstern - die normale
     alwaysOnTop-Stufe reicht dafuer nicht. */
  overlayWin.setAlwaysOnTop(true, 'screen-saver');
  overlayWin.setOpacity(overlayOpacity);
  overlayWin.loadFile(path.join(__dirname, '../renderer/overlay.html'));

  /* ARGUS_DEVTOOLS oeffnet die Entwicklerwerkzeuge des Overlays. Ohne sie ist
     ein Fehler im Overlay-Renderer unsichtbar: das Fenster hat keine
     Menueleiste und keinen Tastenweg dorthin. */
  if (process.env.ARGUS_DEVTOOLS) overlayWin.webContents.openDevTools({ mode: 'detach' });

  const remember = () => {
    if (!overlayWin || overlayWin.isDestroyed()) return;
    overlayBounds = overlayWin.getBounds();
    rememberOverlayLayout();
  };
  overlayWin.on('move', remember);
  overlayWin.on('resize', remember);

  /* Wer zurueck ins Spiel klickt, statt den Hotkey zu druecken, soll nicht mit
     abgeschaltetem Durchlass zurueckbleiben - sonst frisst das Overlay beim
     naechsten Klick den Schuss. */
  overlayWin.on('blur', () => {
    if (!interacting) return;
    interacting = false;
    /* Der Fokus ist schon weg - wohin, hat der Nutzer selbst entschieden.
       Die gemerkte Ruecksprungadresse ist damit hinfaellig. */
    interactReturnTo = null;
    applyMousePassthrough(clickThrough);
    broadcastOverlayState();
  });

  overlayWin.on('closed', () => {
    overlayWin = null;
    interacting = false;
    broadcastOverlayState();
  });

  overlayWin.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  return overlayWin;
}

/**
 * Durchsichtiges Fenster ueber dem ganzen Bildschirm, in dem die Preisschilder
 * sitzen.
 *
 * EIN Fenster statt vier: vier Fenster waeren vier Renderer fuer dieselbe
 * Sache, vier Mal Fensterverwaltung und vier Gelegenheiten, dass eines haengen
 * bleibt. Die Schilder werden darin absolut positioniert.
 *
 * focusable: false und setIgnoreMouseEvents(true) sind hier nicht Komfort,
 * sondern Bedingung: das Fenster liegt genau ueber den Karten, die man
 * anklicken will. Wuerde es einen Klick abfangen, waere die Belohnung weg.
 */
function createTagWindow() {
  const display = screen.getPrimaryDisplay();

  tagWin = new BrowserWindow({
    x: display.bounds.x, y: display.bounds.y,
    width: display.bounds.width, height: display.bounds.height,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    show: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false,
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    title: 'Argus Preisschilder',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  tagWin.setIgnoreMouseEvents(true);
  tagWin.setAlwaysOnTop(true, 'screen-saver');
  tagWin.loadFile(path.join(__dirname, '../renderer/tags.html'));
  if (process.env.ARGUS_DEVTOOLS) tagWin.webContents.openDevTools({ mode: 'detach' });
  tagWin.on('closed', () => { tagWin = null; });

  return tagWin;
}

/**
 * Schilder anzeigen.
 *
 * Die Texterkennung liefert ECHTE Bildschirmpixel, Fenster rechnen in
 * geraetunabhaengigen Punkten. Bei einer Bildschirmskalierung von 125 % laegen
 * die Schilder sonst ein Viertel zu weit rechts und unten.
 */
function showTags(rewards, region) {
  if (!relicTags || !rewards?.length) {
    console.log('[Relikt] Schilder uebersprungen - Schalter:', relicTags,
                'Treffer:', rewards?.length ?? 0);
    return;
  }
  if (!tagWin || tagWin.isDestroyed()) createTagWindow();

  const display = screen.getPrimaryDisplay();
  const scale = display.scaleFactor || 1;
  const originX = region?.x ?? 0;
  const originY = region?.y ?? 0;

  /* Ohne Rahmen laesst sich kein Schild setzen - solche Eintraege werden
     uebergangen, statt die ganze Anzeige mitzureissen. */
  const placeable = rewards.filter(r => r.box);
  if (!placeable.length) {
    console.log('[Relikt] Schilder: kein Eintrag mit Bildschirmposition');
    return;
  }

  /* Nicht direkt unter den Namen: dort verdeckt das Schild die Karte. Ein
     Stueck tiefer sitzt es unter dem Bild und bleibt trotzdem eindeutig
     zugeordnet. */
  const dropPx = Math.round(display.bounds.height * relicTagOffset);

  const tags = placeable.map(r => ({
    name: r.name,
    ducats: r.ducats,
    price: r.price,
    isOwn: r.isOwn,
    position: r.position,
    isCrafted: r.isCrafted ?? false,
    currentOwned: r.currentOwned ?? 0,
    currentRequired: r.currentRequired ?? 1,
    setParts: r.setParts || [],
    /* Mitte des Namens, direkt darunter. */
    cx:  (originX + r.box.x + r.box.w / 2) / scale - display.bounds.x,
    top: (originY + r.box.y + r.box.h) / scale - display.bounds.y + dropPx
  }));

  const send = () => {
    if (tagWin && !tagWin.isDestroyed()) tagWin.webContents.send('tags:show', { tags });
  };

  if (tagWin.webContents.isLoading()) tagWin.webContents.once('did-finish-load', send);
  else send();

  /* show() statt showInactive(): das Fenster ist focusable: false, kann den
     Fokus also gar nicht nehmen. showInactive() dagegen liess das Fenster
     zusammen mit transparent: true unter Windows unsichtbar - nachgemessen,
     das Fenster existierte mit WS_VISIBLE = false. */
  /* Nur beim ersten Mal protokollieren: die Preise werden einzeln
     nachgereicht, und jede Nachlieferung zeichnet die Schilder neu. */
  if (!tagWin.isVisible()) {
    tagWin.show();
    console.log('[Relikt] Schilder gezeigt:', tags.length, '| sichtbar:', tagWin.isVisible());
  }

  /* Zwangsabschaltung. Bisher hing das Verschwinden allein an der Schluss-
     Zeile im Log - bleibt die aus, weil das Spiel abstuerzt, die Zeile sich
     aendert oder der Abruf haengt, klebten die Schilder dauerhaft ueber dem
     Bild. Ueber einem laufenden Spiel ist das die schlechteste aller
     Eigenschaften, deshalb entscheidet ab jetzt die Uhr mit.

     Gerechnet ab dem Zeitpunkt des Fundes, nicht ab jetzt: die Preise werden
     einzeln nachgereicht, und jede Nachlieferung ruft hier erneut an. */
  const endsAt = (currentRelic?.at ?? Date.now()) + (currentRelic?.seconds ?? 15) * 1000 + 2000;
  clearTimeout(tagTimer);
  tagTimer = setTimeout(hideTags, Math.max(1000, endsAt - Date.now()));
}

function hideTags() {
  clearTimeout(tagTimer);
  tagTimer = null;
  if (!tagWin || tagWin.isDestroyed()) return;
  tagWin.webContents.send('tags:hide');
  tagWin.hide();
}

function overlayVisible() {
  return !!(overlayWin && !overlayWin.isDestroyed() && overlayWin.isVisible());
}

function overlayState() {
  return {
    overlay: overlayVisible(),
    clickThrough,
    interacting,
    opacity: overlayOpacity,
    hotkeys: { ...hotkeys }
  };
}

/**
 * Zeigermodus ein- oder ausschalten.
 *
 * An:  Klick-Durchlass aussetzen und den Fokus holen. Warframe verliert den
 *      Vordergrund und gibt damit den Mauszeiger frei.
 * Aus: Fokus abgeben - Windows reicht ihn an das Fenster darunter, also das
 *      Spiel - und den eingestellten Durchlass wiederherstellen.
 *
 * Der Durchlass selbst wird NICHT umgeschaltet: er ist eine Einstellung, der
 * Zeigermodus nur eine kurze Unterbrechung davon. Sonst haette man nach
 * jedem Ausflug ins Overlay eine andere Einstellung als vorher.
 */
function setInteracting(on) {
  /* Zeigermodus darf nur aktiviert werden, wenn das Overlay bereits sichtbar ist.
     Strg + E soll das Overlay nicht von selbst einblenden. */
  if (on && !overlayVisible()) {
    interacting = false;
    return overlayState();
  }
  interacting = !!on;

  if (!overlayWin || overlayWin.isDestroyed()) {
    interacting = false;
    return overlayState();
  }

  if (interacting) {
    /* Vor dem Fokuswechsel merken, wohin er zurueck soll. Haelt das Overlay
       ihn schon, waere die Antwort das Overlay selbst - dann lieber nichts
       merken und den vorherigen Eintrag behalten. */
    if (!overlayWin.isFocused()) interactReturnTo = captureForeground() || interactReturnTo;
    applyMousePassthrough(false);
    overlayWin.focus();
  } else {
    const back = interactReturnTo;
    interactReturnTo = null;
    applyMousePassthrough(clickThrough);
    /* Erst gezielt zurueckgeben; klappt das nicht, bleibt blur() als Notnagel
       - dann landet der Fokus irgendwo, aber jedenfalls nicht mehr hier. */
    if (!restoreForeground(back) && overlayWin.isFocused()) overlayWin.blur();
  }

  broadcastOverlayState();
  return overlayState();
}

/* Beide Fenster bekommen denselben Zustand: das Hauptfenster, damit die
   Titelleiste den Schalter richtig zeigt, das Overlay fuer seine Fussleiste. */
function broadcastOverlayState() {
  const st = overlayState();
  for (const w of [win, overlayWin]) {
    if (w && !w.isDestroyed()) w.webContents.send('overlay:changed', st);
  }
}

/**
 * Overlay einblenden.
 *
 * showInactive() statt show(): Warframe behaelt den Eingabefokus, waehrend das
 * Overlay darueber auftaucht. Mit show() aktiviert Windows das Overlay-Fenster,
 * und beim Ausblenden reicht es den Fokus nicht von selbst ans Spiel zurueck -
 * man muesste erst wieder ins Spielfenster klicken.
 */
function showOverlay() {
  if (!overlayWin || overlayWin.isDestroyed()) {
    createOverlayWindow();
    /* Beim ersten Mal erst zeigen, wenn Inhalt da ist - sonst blitzt ein
       leeres Fenster ueber dem Spiel auf. Danach wird nur noch versteckt und
       wieder gezeigt, das ist sofort da. */
    overlayWin.once('ready-to-show', revealOverlay);
    return;
  }
  revealOverlay();
}

function revealOverlay() {
  if (!overlayWin || overlayWin.isDestroyed()) return;
  overlayWin.showInactive();
  overlayWin.setAlwaysOnTop(true, 'screen-saver');
  applyMousePassthrough(clickThrough);
  broadcastOverlayState();
}

/**
 * Overlay ausblenden - nur verstecken, nicht schliessen: der naechste Aufruf
 * soll sofort da sein, ohne dass Fenster und Renderer neu hochfahren.
 *
 * Wer zwischendurch ins Overlay geklickt hat, hat den Fokus hierher geholt.
 * Dann erst abgeben, damit Windows ihn an das Fenster darunter - das Spiel -
 * zurueckreicht, und danach verstecken.
 */
function hideOverlay() {
  if (!overlayWin || overlayWin.isDestroyed()) return;
  interacting = false;
  if (overlayWin.isFocused()) overlayWin.blur();
  overlayWin.hide();
  broadcastOverlayState();
}

function toggleOverlay() {
  if (overlayVisible()) hideOverlay();
  else showOverlay();
  return overlayState();
}

/* ---------------------------- Daten ---------------------------- */

async function ensureData({ refresh = false, force = false } = {}) {
  const cfg = await loadConfig();
  if (!cache.catalog) cache.catalog = await loadCatalog();
  if (!cache.mods)    cache.mods    = await loadMods();

  const res = await loadProfile(cfg.accountId, cfg.platform, { refresh, force });
  cache.profile = res.profile;
  cache.analysis = analyze(res.profile, cache.catalog);
  return { ...res, cfg };
}

function decorate(entry) {
  const item = cache.catalog.byUniqueName.get(entry.uniqueName) || {};
  return {
    ...entry,
    label: CATEGORY_LABELS[entry.category] || entry.category,
    image: imageUrl(entry.uniqueName, 128),
    description: item.description || ''
  };
}

const FOCUS_NAMES = {
  AP_ATTACK: 'Madurai', AP_DEFENSE: 'Vazarin', AP_TACTIC: 'Naramon',
  AP_POWER: 'Zenurik', AP_WARD: 'Unairu'
};

/** Zusatzinfos fuer den Profilkopf - alles bereits im Profil vorhanden. */
function profileExtras(profile) {
  const preset = profile.LoadOutPreset || {};

  // Der Preset nennt nur den Warframe-Namen; das Bild kommt ueber den Katalog.
  let loadout = null;
  if (preset.n) {
    const frame = cache.catalog.items.find(
      i => i.name === preset.n && i.productCategory === 'Suits'
    );
    loadout = {
      name: preset.n,
      image: frame ? imageUrl(frame.uniqueName, 512) : null,
      focus: FOCUS_NAMES[preset.FocusSchool] || null
    };
  }

  const createdMs = Number(profile.Created?.$date?.$numberLong) || null;
  const chart = starChart(profile);

  return {
    loadout,
    clan: profile.GuildName || null,
    createdMs,
    yearsPlayed: createdMs ? ((Date.now() - createdMs) / 3.156e10).toFixed(1) : null,
    nodes: chart.nodes,
    junctions: chart.junctions,
    challenges: (profile.ChallengeProgress || []).length,
    syndicates: (profile.Affiliations || []).length
  };
}

async function buildDashboard(meta) {
  const a = cache.analysis;
  const s = a.summary;
  const rec = recommend(a, cache.catalog, { limit: 200 });
  const st = await store.load();

  const goals = st.goals.map(g => {
    const entry = a.entries.find(e => e.uniqueName === g.uniqueName);
    const owned = entry ? entry.status === STATUS.PARTIAL : false;
    const rank = entry ? entry.rank : 0;
    const maxLvl = entry ? entry.maxLvl : 30;
    const ranksLeft = Math.max(0, maxLvl - rank);
    const r = owned ? null : resolveGoal(g.uniqueName, cache.catalog);
    return {
      ...g,
      image: imageUrl(g.uniqueName, 128),
      gain: entry ? entry.gain : 0,
      status: entry ? entry.status : 'missing',
      owned,
      kind: owned ? 'level' : 'farm',
      rank,
      maxLvl,
      ranksLeft,
      components: r ? r.components.map(c => ({
        ...c,
        image: imageUrl(c.uniqueName, 128),
        ingredients: c.ingredients.map(ing => ({
          ...ing,
          image: imageUrl(ing.uniqueName, 128)
        }))
      })) : [],
      materials: r ? r.materials.slice(0, 14).map(m => ({
        ...m,
        image: imageUrl(m.uniqueName, 128)
      })) : [],
      credits: r ? r.totalCredits : 0,
      buildTime: r ? formatDuration(r.totalBuildSeconds) : '',
      note: st.notes[g.uniqueName] || ''
    };
  });

  const openFarmGoals = goals.filter(g => !g.done && !g.owned).map(g => g.uniqueName);
  const shopping = openFarmGoals.length
    ? combineGoals(openFarmGoals, cache.catalog)
    : { materials: [], totalCredits: 0, totalBuildSeconds: 0 };

  const byCategory = {};
  for (const e of a.entries) {
    const g = byCategory[e.category] || (byCategory[e.category] = { done: 0, total: 0, gain: 0 });
    g.total++; g.gain += e.gain;
    if (e.status === STATUS.DONE) g.done++;
  }

  return {
    player: {
      name: displayName(cache.profile),
      mr: s.mr, mrName: masteryRankName(s.mr), reportedMR: s.reportedMR,
      computedMR: s.computedMR, hiddenXP: s.hiddenXP,
      /* Fortschritt gegen den gemeldeten Rang, nicht gegen den errechneten. */
      progress: progressForMR(s.totalXP, s.mr),
      totalXP: s.totalXP, breakdown: s.breakdown,
      counts: s.counts, openGain: s.openGain, potentialMR: s.potentialMR,
      ...profileExtras(cache.profile)
    },
    meta: {
      fetchedAt: meta && meta.fetchedAt ? meta.fetchedAt : null,
      fromCache: !!(meta && meta.fromCache),
      message: (meta && meta.message) || null
    },
    quickWins: rec.quickWins.slice(0, 8).map(decorate),
    easyGains: diversify(rec.easyGains, 2, 8).map(decorate),
    warframes: rec.all.filter(r => r.category === 'Suits' && !r.owned).slice(0, 8).map(decorate),
    categories: Object.entries(byCategory)
      .map(([k, v]) => ({ key: k, label: CATEGORY_LABELS[k] || k, ...v }))
      .sort((x, y) => y.gain - x.gain),
    goals,
    shopping: {
      materials: shopping.materials.slice(0, 20).map(m => ({
        ...m,
        image: imageUrl(m.uniqueName, 128)
      })),
      credits: shopping.totalCredits,
      buildTime: formatDuration(shopping.totalBuildSeconds)
    },
    generalNotes: st.generalNotes
  };
}

/* ------------------------- Overframe-Import ------------------------- */

/**
 * Liest die Mod-Namen einer Overframe-Build-Seite.
 *
 * Noetig, weil die API nur interne Mod-IDs liefert und Overframe kein
 * oeffentliches Mapping anbietet. Das Fenster bleibt unsichtbar, laedt nur die
 * eine Seite und wird sofort wieder geschlossen.
 */
function scrapeModNames(buildUrl) {
  return new Promise((resolve, reject) => {
    const w = new BrowserWindow({
      show: false,
      webPreferences: { offscreen: true, javascript: true, images: false }
    });

    const done = (fn, arg) => { try { w.destroy(); } catch {} fn(arg); };
    const timer = setTimeout(() => done(reject, new Error('Timed out while loading the page.')), 25000);

    w.webContents.on('did-finish-load', async () => {
      try {
        // Die Slots werden clientseitig gerendert - kurz warten.
        await new Promise(r => setTimeout(r, 2500));
        const names = await w.webContents.executeJavaScript(`(() => {
          const box = document.querySelector('[class*="buildSlots"]');
          if (!box) return null;
          const all = [...box.querySelectorAll('[class*="Mod_"]')];
          const cards = [];
          all.forEach(c => { if (!cards.some(u => u.contains(c) || c.contains(u))) cards.push(c); });
          return cards.map(c => {
            const lines = c.innerText.split('\\n').map(s => s.trim()).filter(Boolean);
            const hasDrain = /^[\\u2191\\u2193]?\\d+$/.test(lines[0] || '');
            return {
              drain: hasDrain ? lines[0] : null,
              name:  hasDrain ? lines[1] : lines[0]
            };
          });
        })()`);
        clearTimeout(timer);
        done(resolve, names);
      } catch (err) {
        clearTimeout(timer);
        done(reject, err);
      }
    });

    w.webContents.on('did-fail-load', (_e, code, desc) => {
      clearTimeout(timer);
      done(reject, new Error(`Page unreachable (${desc || code}).`));
    });

    w.loadURL(buildUrl, { userAgent: OF_USER_AGENT });
  });
}

/**
 * Prueft die Zuordnung: der drain aus der API muss zum drain im DOM passen.
 * Stimmt das nicht, hat Overframe die Reihenfolge geaendert - dann lieber
 * abbrechen als falsche Mods speichern.
 */
function verifyAlignment(raw, scraped) {
  const slots = raw.slots || [];
  let checked = 0, ok = 0;
  for (let i = 0; i < Math.min(slots.length, scraped.length); i++) {
    const dom = scraped[i]?.drain;
    if (dom == null) continue;
    checked++;
    if (Math.abs(Number(String(dom).replace(/[^\d]/g, ''))) === Math.abs(slots[i].drain)) ok++;
  }
  return { checked, ok, reliable: checked === 0 ? false : ok / checked >= 0.8 };
}

async function importOverframeBuild(input) {
  const id = parseBuildId(input);
  if (!id) throw new Error('Not a valid Overframe build URL or ID.');

  const raw = await fetchBuild(id);
  let modMap = await loadModMap();

  const unknown = unknownModIds(raw, modMap);
  let scrapeNote = null;

  if (unknown.length) {
    const url = raw.url?.startsWith('http') ? raw.url : `https://overframe.gg/build/${id}/`;
    const scraped = await scrapeModNames(url);
    if (!scraped || !scraped.length) {
      throw new Error('Die Mod-Namen liessen sich nicht auslesen - Overframe hat vermutlich '
                    + 'the page structure has changed.');
    }
    const check = verifyAlignment(raw, scraped);
    if (!check.reliable) {
      throw new Error(`Match is unreliable (${check.ok}/${check.checked} check values agree) — `
                    + 'Import abgebrochen, damit keine falschen Mods gespeichert werden.');
    }
    const merged = mergeNames(raw, scraped.map(s => s.name), modMap);
    modMap = merged.map;
    await saveModMap(modMap);
    scrapeNote = `Learned ${merged.added} new mod names (${check.ok}/${check.checked} check values ok)`;
  }

  const build = toBuild(raw, modMap, cache.mods, cache.catalog);
  return { build, scrapeNote };
}

/* ---------------------------- IPC ---------------------------- */

/**
 * Ersteinrichtung.
 *
 * WARUM ES DAS BRAUCHT:
 *   Ohne Account-ID lief frueher ensureData() ins Leere und die Oberflaeche
 *   zeigte eine rote Fehlerzeile - fuer jemanden, der die App gerade
 *   installiert hat, eine Sackgasse. Den Ausweg kannte nur, wer das README
 *   gelesen und eine JSON-Datei von Hand angelegt hat. Das ist die Huerde
 *   zwischen "heruntergeladen" und "benutzt es".
 *
 * WAS ZURUECKGEHT:
 *   Nur ob eingerichtet ist, und die letzten vier Zeichen der Kennung. Die
 *   vollstaendige Account-ID verlaesst den Hauptprozess nicht - siehe die
 *   Zusage im Kopf dieser Datei. Der Preis dafuer ist, dass man sie beim
 *   Aendern neu eintippen muss; ein Feld mit der gespeicherten Kennung waere
 *   bequemer, wuerde die Zusage aber brechen.
 */
ipcMain.handle('setup:state', async () => {
  const cfg = await loadConfig();
  const id = String(cfg.accountId || '');
  return {
    configured: isValidAccountId(id),
    hint: id.length >= 4 ? id.slice(-4) : '',
    platform: cfg.platform || 'pc',
    /* Der lesende Speicherzugriff auf den Spielprozess ist AUS, solange ihn
       niemand ausdruecklich einschaltet. Ein Programm, das ungefragt fremde
       Prozesse liest, hat die Zustimmung nicht, die es dafuer braucht - und
       ein frisch heruntergeladenes Programm hat sie erst recht nicht. */
    inventoryScan: cfg.inventoryScan === true
  };
});

/**
 * Einrichtung speichern und den ersten Profilabruf ausloesen.
 *
 * Der Abruf laeuft ABSICHTLICH durch dieselbe Drosselung wie jeder spaetere
 * (kein force): waere er ausgenommen, koennte man sich ueber wiederholtes
 * Neu-Einrichten genau die IP-Sperre einhandeln, gegen die ratelimit.js
 * gebaut wurde. Bei einer vertippten Kennung heisst das fuenf Minuten warten -
 * die Formatpruefung unten faengt die meisten Vertipper vorher ab.
 */
/**
 * Die Ersteinrichtung darf die 10-Minuten-Sperre umgehen - begrenzt.
 *
 * WARUM UEBERHAUPT:
 *   Eine Einrichtung besteht aus zwei Anfragen: Profil und Inventar. Waere
 *   die zweite durch die Sperre blockiert, muesste der Nutzer nach dem
 *   Einrichten zehn Minuten warten, um die Haelfte dessen zu sehen, wofuer
 *   er gerade eine Berechtigung erteilt hat.
 *
 * WARUM MIT DECKEL:
 *   Ohne Deckel waere das ein Loch in genau dem Schutz, fuer den
 *   ratelimit.js existiert: wer bei einem Netzwerkfehler zwanzigmal auf
 *   "Allow" drueckt, handelt sich die IP-Sperre ein, die den Spiel-Login
 *   blockiert. Nach fuenf Versuchen gilt deshalb wieder die normale
 *   Drosselung.
 */
let setupAttempts = 0;
const SETUP_FORCE_LIMIT = 5;
const mayForceSetup = () => setupAttempts++ < SETUP_FORCE_LIMIT;

/**
 * Erster Abruf nach dem Einrichten: Profil, danach das Inventar.
 *
 * Das Inventar darf scheitern, ohne die Einrichtung zu kippen - ohne
 * Speicherzugriff, bei geschlossenem Spiel oder auf einer Konsole gibt es
 * keins, und das Dashboard steht auch ohne. Gemeldet wird es trotzdem.
 */
async function firstFetch({ withInventory }) {
  const force = mayForceSetup();
  const meta = await ensureData({ refresh: true, force });

  let inventoryNote = null;
  if (withInventory) {
    try {
      await loadInventory({ refresh: true, force });
    } catch (err) {
      inventoryNote = INVENTORY_ERRORS[err.code] || err.message;
    }
  }
  return { data: await buildDashboard(meta), inventoryNote };
}

/**
 * Der bequeme Weg: Account-ID aus dem laufenden Spiel lesen.
 *
 * WARUM DAS DIE VORDERE TUER IST:
 *   Die Kennung von Hand einzutragen hiess: auf warframe.com einloggen, eine
 *   API-URL aufrufen, 24 Hex-Zeichen abschreiben. Das ist eine Huerde, die
 *   nach Bastelei aussieht - und sie ist unnoetig, denn derselbe Scan, der
 *   das Inventar holt, liest die Kennung ohnehin mit. Aus zwei Fragen
 *   (Kennung eintippen + Haken fuer Speicherzugriff) wird so eine einzige.
 *
 * Die Kennung geht dabei NICHT an den Renderer - sie wird hier gelesen,
 * hier gespeichert und hier benutzt.
 */
ipcMain.handle('setup:detect', async () => {
  const creds = await scanCredentials();
  if (!creds.ok) {
    return { ok: false, code: creds.code,
             error: INVENTORY_ERRORS[creds.code] || creds.message };
  }

  /* Wer im Speicher des laufenden Spiels gefunden wurde, spielt auf dem PC -
     eine Plattformabfrage waere hier eine Frage ohne Zweck. */
  const cfg = await loadConfig();
  await saveConfig({ ...cfg, accountId: creds.accountId, platform: 'pc', inventoryScan: true });

  try {
    const { data, inventoryNote } = await firstFetch({ withInventory: true });
    return { ok: true, data, inventoryNote };
  } catch (err) {
    return { ok: false, code: err.code || null, error: err.message,
             rateLimited: !!err.rateLimited };
  }
});

ipcMain.handle('setup:save', async (_e, data = {}) => {
  const id = String(data.accountId || '').trim().toLowerCase();
  if (!isValidAccountId(id)) {
    return { ok: false, field: 'accountId',
             error: 'That does not look like an account ID. Expected 24 characters, digits and a-f only.' };
  }

  const platform = ['pc', 'psn', 'xbox', 'switch', 'mobile'].includes(data.platform)
    ? data.platform : 'pc';

  const cfg = await loadConfig();
  /* Der Handweg ist der Weg fuer alle, die den Speicherzugriff nicht wollen -
     er schaltet ihn deshalb NICHT ein. */
  await saveConfig({ ...cfg, accountId: id, platform, inventoryScan: cfg.inventoryScan === true });

  /* Der erste Abruf gehoert in die Einrichtung, nicht dahinter: sonst landet
     der Nutzer nach dem Speichern wieder auf derselben Fehlerzeile wie
     vorher, nur mit anderem Text. */
  try {
    const { data: dash } = await firstFetch({ withInventory: false });
    return { ok: true, data: dash };
  } catch (err) {
    /* Die Kennung bleibt gespeichert: sie kann richtig sein und nur der
       Abruf gescheitert (kein Netz, DE drosselt). Beim naechsten Start
       geht es dann ohne erneutes Eintippen weiter. */
    return { ok: false, field: err.status === 409 ? 'accountId' : null,
             error: err.message, rateLimited: !!err.rateLimited };
  }
});

/**
 * Den Inventar-Abruf nachtraeglich ein- oder ausschalten.
 *
 * Getrennt von setup:save, weil hier NUR dieses eine Feld angefasst wird:
 * die Einstellung soll umlegbar sein, ohne dass dabei die Account-ID durch
 * den Renderer laeuft.
 */
ipcMain.handle('setup:setScan', async (_e, on) => {
  const cfg = await loadConfig();
  await saveConfig({ ...cfg, inventoryScan: on === true });
  return { ok: true, inventoryScan: on === true };
});

/**
 * Link im richtigen Browser oeffnen, nicht im Fenster der App.
 *
 * Die Positivliste ist kein Selbstzweck: shell.openExternal reicht an das
 * Betriebssystem weiter, was es bekommt. Eine offene Fassung waere ein
 * Werkzeug zum Starten beliebiger Ziele, sobald irgendwo im Renderer eine
 * fremde Zeichenkette durchrutscht.
 */
const EXTERNAL_ALLOWED = [
  'https://www.warframe.com/api/user-data',
  'https://github.com/Kr3akz/Argus'
];
ipcMain.handle('shell:open', async (_e, url) => {
  if (!EXTERNAL_ALLOWED.includes(String(url))) return { ok: false };
  await shell.openExternal(String(url));
  return { ok: true };
});

ipcMain.handle('dashboard:get', async () => {
  try {
    const meta = await ensureData({ refresh: false });
    return { ok: true, data: await buildDashboard(meta) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('profile:refresh', async () => {
  try {
    const meta = await ensureData({ refresh: true });
    return { ok: true, data: await buildDashboard(meta), message: meta.message || null };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('goal:resolve', async (_e, uniqueName) => {
  const r = resolveGoal(uniqueName, cache.catalog);
  return { ...r, buildTimeText: formatDuration(r.totalBuildSeconds) };
});

const rebuilt = async () => ({ ok: true, data: await buildDashboard({ fromCache: true }) });

ipcMain.handle('goal:add',     async (_e, u, n) => { await store.addGoal(u, n); return rebuilt(); });
ipcMain.handle('goal:remove',  async (_e, u)    => { await store.removeGoal(u); return rebuilt(); });
ipcMain.handle('goal:toggle',  async (_e, u)    => { await store.toggleGoal(u); return rebuilt(); });
ipcMain.handle('note:set',     async (_e, u, t) => { await store.setNote(u, t); return rebuilt(); });
ipcMain.handle('note:general', async (_e, t)    => { await store.setGeneralNotes(t); return { ok: true }; });

ipcMain.handle('items:search', async (_e, query) => {
  const q = String(query || '').toLowerCase().trim();
  if (q.length < 2) return [];
  return cache.analysis.entries
    .filter(e => (e.name || '').toLowerCase().includes(q))
    .slice(0, 30)
    .map(decorate);
});

ipcMain.handle('item:details', async (_e, uniqueName) => {
  try {
    if (!cache.catalog || !cache.analysis) await ensureData({ refresh: false });
    const item = cache.catalog.byUniqueName.get(uniqueName);
    if (!item) return { ok: false, error: 'Item not found in the catalogue.' };

    const entry = cache.analysis.entries.find(e => e.uniqueName === uniqueName);
    const cls = classify(item);
    const acq = acquisitionOf(item);
    const st = await store.load();
    const isGoal = st.goals.some(g => g.uniqueName === uniqueName && !g.done);
    const isGoalDone = st.goals.some(g => g.uniqueName === uniqueName && g.done);

    // Recipe
    const recipe = resolveGoal(uniqueName, cache.catalog);
    const components = (recipe.components || []).map(c => ({
      ...c,
      image: imageUrl(c.uniqueName, 128),
      ingredients: (c.ingredients || []).map(ing => ({
        ...ing,
        image: imageUrl(ing.uniqueName, 128)
      }))
    }));
    const materials = recipe.materials.map(m => ({
      ...m,
      image: imageUrl(m.uniqueName, 128)
    }));

    // Stats formatting
    let stats = [];
    if (item.productCategory === 'Suits') {
      stats = [
        { label: 'Health', val: item.health ?? '—' },
        { label: 'Shield', val: item.shield ?? '—' },
        { label: 'Armour', val: item.armor ?? '—' },
        { label: 'Energy', val: item.power ?? '—' },
        { label: 'Sprint speed', val: item.sprintSpeed ? item.sprintSpeed.toFixed(2) : '—' }
      ];
    } else {
      if (item.totalDamage !== undefined) stats.push({ label: 'Total damage', val: item.totalDamage });
      if (item.criticalChance !== undefined) stats.push({ label: 'Crit chance', val: `${(item.criticalChance * 100).toFixed(1)}%` });
      if (item.criticalMultiplier !== undefined) stats.push({ label: 'Crit multiplier', val: `${item.criticalMultiplier.toFixed(1)}x` });
      if (item.procChance !== undefined) stats.push({ label: 'Status chance', val: `${(item.procChance * 100).toFixed(1)}%` });
      if (item.fireRate !== undefined) stats.push({ label: 'Fire rate', val: item.fireRate.toFixed(2) });
      if (item.magazineSize !== undefined) stats.push({ label: 'Magazine', val: item.magazineSize });
      if (item.reloadTime !== undefined) stats.push({ label: 'Reload time', val: `${item.reloadTime.toFixed(1)}s` });
      if (item.trigger !== undefined) stats.push({ label: 'Trigger', val: item.trigger });
    }

    return {
      ok: true,
      data: {
        uniqueName: item.uniqueName,
        name: item.name,
        category: cls.category,
        categoryLabel: CATEGORY_LABELS[cls.category] || cls.category,
        image: imageUrl(item.uniqueName, 256),
        description: cleanGameText(item.description),
        masteryReq: item.masteryReq || 0,
        potentialXP: entry ? entry.potential : (cls.xpPerRank * (item.maxLevelCap || 30)),
        status: entry ? entry.status : 'missing',
        rank: entry ? entry.rank : 0,
        maxLvl: entry ? entry.maxLvl : 30,
        gain: entry ? entry.gain : 0,
        source: acq.label,
        sourceNote: acq.note,
        isGoal,
        isGoalDone,
        stats,
        passiveDescription: cleanGameText(item.passiveDescription),
        abilities: (item.abilities || []).map(ab => ({
          name: cleanGameText(ab.abilityName),
          description: cleanGameText(ab.description)
        })),
        components,
        materials,
        credits: recipe.totalCredits,
        buildTime: formatDuration(recipe.totalBuildSeconds),
        hasRecipe: recipe.materials.length > 0 || recipe.totalCredits > 0 || components.length > 0
      }
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('checklist:get', async (_e, category) => {
  return cache.analysis.entries
    .filter(e => !category || e.category === category)
    .sort((x, y) => (x.name || '').localeCompare(y.name || ''))
    .map(decorate);
});

ipcMain.handle('worldstate:get', async (_e, force) => {
  return await fetchWorldState({ force: !!force });
});

ipcMain.handle('farming:get', async (_e, query) => {
  return searchResourceGuides(query);
});

/* ------------------------ Relikte: Bausteine ------------------------

   Dieselben drei Schritte brauchen der Dukaten-Tab (alle eigenen Relikte) und
   die Merkliste (nur die ausgewaehlten). Deshalb hier einmal, statt zweimal
   nebeneinander zu altern.
   ------------------------------------------------------------------ */

/** Gecachte Marktpreise von Platte. Ohne sie gibt es Dukaten, aber kein Platin. */
async function readPriceCache() {
  /* Der leere catch hat hier frueher verdeckt, dass existsSync und readFile
     nicht importiert waren: der ReferenceError verschwand wortlos, und der
     Cache blieb leer. Deshalb wird der Fehlschlag gemeldet. */
  try {
    const p = dataFile('market-prices.json');
    if (existsSync(p)) return JSON.parse(await readFile(p, 'utf8')) || {};
  } catch (err) {
    console.error('[Dukaten] Preis-Cache nicht lesbar:', err.message);
  }
  return {};
}

/** Basispfad + Zustand -> Bild-URL. Ohne Pfad kein Bild, statt einer Ausnahme. */
function relicImage(base, state) {
  const p = relicIconPath(base, state);
  return p ? imageUrl(p, 128) : null;
}

/**
 * Bestand je Relikt UND Zustand aus dem Inventar.
 * Strahlend und intakt sind dasselbe Relikt, aber nicht dieselbe Entscheidung.
 */
function ownedRelics(inventory, market) {
  const owned = new Map();

  for (const row of inventory?.MiscItems || []) {
    if (typeof row.ItemType !== 'string' || !row.ItemType.includes('/Projections/')) continue;
    const res = resolveInventoryRelic(market, row.ItemType);
    if (!res?.key) continue;

    const k = res.key + '|' + res.state;
    const prev = owned.get(k);
    if (prev) { prev.count += row.ItemCount || 1; continue; }

    owned.set(k, {
      key: res.key,
      state: res.state,
      count: row.ItemCount || 1,
      image: relicImage(res.base, res.state)
    });
  }
  return owned;
}

/**
 * Katalog-Eintrag ueber den Anzeigenamen.
 *
 * Der Index haengt am Katalog selbst und nicht an einer Variablen daneben -
 * so bekommt ein neu geladener Katalog zwangslaeufig einen neuen Index, statt
 * dass ein alter stehenbleibt.
 */
function catalogItemByName(catalog, name) {
  if (!catalog || !name) return null;

  if (!catalog.byName) {
    catalog.byName = new Map();
    for (const it of [...(catalog.items || []), ...(catalog.lookup || [])]) {
      const n = (it.name || '').toLowerCase();
      /* Erster Treffer gewinnt: items stehen vor lookup, echte Items also vor
         den blossen Nachschlage-Eintraegen (siehe catalog.js). */
      if (n && !catalog.byName.has(n)) catalog.byName.set(n, it);
    }
  }
  return catalog.byName.get(String(name).toLowerCase().trim()) || null;
}

/**
 * Bild fuer Belohnungen, die der Markt nicht fuehrt.
 *
 * Forma, Kuva, Exilus-Adapter und Riven-Splitter sind nicht handelbar und
 * stehen deshalb in keiner Marktliste - in den Droptabellen sehr wohl, und
 * Forma steckt in fast jedem Relikt. Ohne diesen Umweg ueber den Katalog
 * bliebe ausgerechnet die haeufigste Belohnung ohne Bild.
 *
 * Die Mengenangabe gehoert zur Zeile, nicht zum Item ("2X Forma Blueprint") -
 * zum Nachschlagen wird sie abgeschnitten.
 */
function nonMarketImage(catalog, name) {
  const clean = String(name || '').replace(/^\d+X\s+/i, '').trim();
  const isBlueprint = /\sBlueprint$/i.test(clean);
  const base = isBlueprint ? clean.replace(/\sBlueprint$/i, '') : clean;

  const item = catalogItemByName(catalog, base) || catalogItemByName(catalog, clean);
  if (!item?.uniqueName) return null;

  /* Belohnt wird der Bauplan, nicht das fertige Teil: im Spiel sieht man das
     Bauplan-Symbol, und genau das soll hier stehen. */
  if (isBlueprint) {
    const recipe = catalog.recipeFor?.get(item.uniqueName);
    if (recipe?.uniqueName) return imageUrl(recipe.uniqueName, 128);
  }
  return imageUrl(item.uniqueName, 128);
}

/** Belohnungsname -> Dukaten, Platin, Markt-Kennung und Bild. */
function relicRewardLookup(market, priceCache, catalog) {
  return name => {
    const m = market ? findMarketItem(market, { name }) : null;
    if (!m) {
      /* Nicht handelbar heisst: kein Preis, keine Dukaten - aber ein Bild. */
      const image = nonMarketImage(catalog, name);
      return image ? { ducats: null, plat: null, slug: null, image } : null;
    }
    return {
      ducats: m.ducats ?? null,
      plat: priceCache[m.slug]?.price?.min ?? null,
      slug: m.slug,
      /* Bild aus DEs Export ueber gameRef, nicht das Thumbnail von
         warframe.market: die Content-Security-Policy der Oberflaeche laesst
         nur cdn.jsdelivr.net zu, Marktbilder blieben wortlos leer. */
      image: m.gameRef ? imageUrl(m.gameRef, 128) : null
    };
  };
}

/**
 * Gemerkte Relikte mit frischen Zahlen.
 *
 * Gespeichert ist nur die Kennung - Bestand, Preise und Erwartungswert werden
 * bei jedem Abruf neu gerechnet. Ein gemerktes Relikt, das gerade nicht im
 * Inventar liegt, faellt deshalb nicht aus der Liste: dann ist es kein
 * Bestand, sondern ein Farmziel, und genau das soll im Overlay stehen.
 */
async function describeTrackedRelics() {
  const saved = await store.load();
  const tracked = saved.trackedRelics || [];
  if (!tracked.length) return [];

  if (!cache.catalog) cache.catalog = await loadCatalog();

  const market = await loadMarketItems().catch(() => null);
  const invRes = await loadInventory({ refresh: false }).catch(() => null);
  const priceCache = await readPriceCache();
  const relicIdx = await loadRelicTables();

  const owned = ownedRelics(invRes?.inventory, market);
  const lookup = relicRewardLookup(market, priceCache, cache.catalog);

  const entries = tracked.map(t => {
    const state = t.state || 'Intact';
    const have = owned.get(t.key + '|' + state);
    if (have) return have;

    /* Nicht im Bestand: das Bild kommt dann ueber die Marktliste, die als
       einzige auch die vaulted Relikte kennt (siehe relics.js). */
    const base = market ? findMarketItem(market, { name: t.key + ' Relic' })?.gameRef : null;
    return { key: t.key, state, count: 0, image: relicImage(base, state) };
  });

  const planned = planRelics(relicIdx, entries, lookup);
  const byId = new Map(planned.map(p => [p.key + '|' + p.state, p]));

  /* Reihenfolge wie im Planer: was am meisten bringt, zuerst. Die Merkliste
     selbst ist ungeordnet - sie haelt fest, WAS gemerkt wurde, nicht wie viel
     es heute wert ist. */
  return tracked
    .map((t, i) => {
      const id = t.key + '|' + (t.state || 'Intact');
      const hit = byId.get(id);
      if (hit) return { id, ...hit };

      /* Kein Eintrag in der Droptabelle - vaulted Relikte stehen dort nicht.
         Lieber ohne Zahlen zeigen als stillschweigend verschlucken. */
      return {
        id, key: t.key, tier: t.tier || '', name: t.name || t.key,
        state: t.state || 'Intact', count: entries[i].count, image: entries[i].image,
        rewards: [], expPlat: 0, expDucats: 0, pricedShare: 0, noTable: true
      };
    })
    .sort((a, b) => b.expPlat - a.expPlat || b.expDucats - a.expDucats);
}

/* Beide Fenster: das Hauptfenster zeichnet die Sterne im Planer, das Overlay
   seinen Abschnitt - und beide sollen nach einem Klick gleich stehen. */
function broadcastTrackedRelics(list) {
  for (const w of [win, overlayWin]) {
    if (w && !w.isDestroyed()) w.webContents.send('relics:tracked-changed', list);
  }
}

ipcMain.handle('relics:tracked', async () => {
  try { return await describeTrackedRelics(); }
  catch (err) {
    console.error('[Relikt] Merkliste nicht lesbar:', err.message);
    return [];
  }
});

ipcMain.handle('relics:toggleTracked', async (_e, entry) => {
  await store.toggleTrackedRelic(entry || {});
  const list = await describeTrackedRelics().catch(() => []);
  broadcastTrackedRelics(list);
  return list;
});

ipcMain.handle('relics:clearTracked', async () => {
  await store.clearTrackedRelics();
  broadcastTrackedRelics([]);
  return [];
});

ipcMain.handle('ducats:get', async () => {
  if (!cache.catalog) await ensureData({ refresh: false });
  const market = await loadMarketItems().catch(() => null);
  const invRes = await loadInventory({ refresh: false }).catch(() => null);

  /* Gecachte Marktpreise. Ohne sie zeigt der Tab zwar Dukaten - die stehen in
     der Marktliste -, aber keinen einzigen Platinpreis. */
  const priceCache = await readPriceCache();

  const inventoryData = invRes?.inventory
    ? buildInventoryDucats(invRes.inventory, cache.catalog, market, priceCache)
    : {
        items: [],
        summary: {
          totalDucats: 0,
          totalItems: 0,
          uniqueParts: 0,
          duplicateDucats: 0,
          duplicateItems: 0,
          totalPlatMin: 0,
          totalPlatMedian: 0,
          pricedRatio: 0
        }
      };

  const catalogData = buildDucatsCatalog(cache.catalog, market, priceCache);

  /* Sets nur aus dem, was man besitzt: eine Liste aller 160 Prime-Sets waere
     ein Katalog, keine Antwort auf "was fehlt mir noch". */
  const masteredDucats = new Set([
    ...(invRes?.inventory?.XPInfo || []).map(e => e.ItemType),
    ...(invRes?.inventory?.Suits || []).map(e => e.ItemType),
    ...(invRes?.inventory?.Weapons || []).map(e => e.ItemType),
    ...(invRes?.inventory?.SpaceSuits || []).map(e => e.ItemType),
    ...(invRes?.inventory?.SpaceWeapons || []).map(e => e.ItemType),
    ...(invRes?.inventory?.MechSuits || []).map(e => e.ItemType)
  ]);
  const sets = buildPrimeSets(market, priceCache, inventoryData.items, {
    onlyOwned: true,
    catalog: cache.catalog,
    mastered: masteredDucats
  });

  /* Relikt-Planer: was bringt das Oeffnen im Schnitt. Faellt er aus, laeuft
     der Rest des Tabs weiter - er ist eine Zugabe, keine Voraussetzung. */
  let relicPlan = [];
  let trackedRelics = [];
  try {
    const relicIdx = await loadRelicTables();
    const ownedMap = ownedRelics(invRes?.inventory, market);
    relicPlan = planRelics(relicIdx, [...ownedMap.values()],
      relicRewardLookup(market, priceCache, cache.catalog));

    /* Nur die Kennungen: welche Karten im Planer als gemerkt zu zeichnen sind.
       Die ausgerechnete Fassung holt sich das Overlay selbst. */
    const saved = await store.load();
    trackedRelics = (saved.trackedRelics || []).map(t => ({
      id: t.key + '|' + (t.state || 'Intact'), key: t.key, state: t.state || 'Intact'
    }));
  } catch { /* ohne Planer laeuft der Rest weiter */ }

  return {
    reference: getDucatsReferenceList(),
    inventory: inventoryData,
    catalog: catalogData,
    sets,
    relicPlan,
    trackedRelics,
    hasInventory: !!invRes?.inventory,
    isDevelopmentInventory: !!invRes?.isDevelopmentInventory,
    pricesFetchedAt: Object.values(priceCache)[0]?.fetchedAt || null,
    hasPrices: Object.keys(priceCache).length > 0
  };
});

ipcMain.handle('ducats:fetchPrices', async (_e, slugs = []) => {
  if (!Array.isArray(slugs) || !slugs.length) return {};
  const prices = await getPrices(slugs);
  return prices;
});

/* ---------------------------- Inventar ---------------------------- */

/**
 * Fehlercodes aus der Speichersuche in Saetze uebersetzen.
 * Der Nutzer soll lesen, was zu tun ist, nicht wie der Code heisst.
 */
const INVENTORY_ERRORS = {
  no_process:    'Warframe is not running. Start the game, log in, and try again.',
  not_found:     'No credentials were found in the game\u2019s memory. That happens while you are '
               + 'still on the login screen — go to your orbiter once and try again.',
  open_failed:   'The Warframe process could not be opened. If the game runs as administrator, '
               + 'muss dieses Fenster ebenfalls als Administrator laufen.',
  timeout:       'Searching the game memory took too long. Please try again.',
  unsupported:   'Fetching the inventory only works on Windows (64-bit).',
  koffi_missing: 'The memory module is missing. Run "npm install" in the project folder once.',
  scan_failed:   'Searching the game memory failed.',
  scan_disabled: 'Fetching the inventory is switched off. It reads the current session\u2019s '
               + 'credentials from the game process memory — read-only. You can turn it on '
               + 'under Settings → Inventory access.'
};

/**
 * Gefaessbilder der Arcanes nachreichen.
 *
 * NUR Arcanes: Mod-Karten zeichnet die Oberflaeche selbst aus Rahmen,
 * Illustration und Text, weil nur so beide Zustaende moeglich sind. Ein
 * Arcane ist dagegen ein einzelnes Gefaess ohne zweiten Zustand - dafuer ist
 * das fertige Bild genau richtig.
 *
 * Ohne Netz oder beim allerersten Start gibt es die Zuordnung noch nicht -
 * dann bleibt `card` leer und es bleibt beim Bild aus DEs Export. Ein
 * fehlendes Bild darf den Inventar-Abruf nicht scheitern lassen.
 */
async function attachCards(view) {
  if (!cache.cards) {
    try { cache.cards = await loadCardImages({}); }
    catch (err) { console.warn('[Karten] Bildverzeichnis nicht verfügbar:', err.message); return; }
  }
  for (const e of view.sections.arcanes || []) e.card = cardUrl(cache.cards, e, 128);
}

/** Gemeinsamer Aufbau fuer get und refresh. */
async function inventoryPayload({ refresh }) {
  if (!cache.catalog) await ensureData({ refresh: false });

  const res = await loadInventory({ refresh });
  const view = buildInventory(res.inventory, cache.catalog);
  await attachCards(view);
  const gate = await checkAllowed({});

  let sets = [];
  try {
    const market = await loadMarketItems().catch(() => null);
    const priceCache = await readPriceCache();
    if (market && res.inventory) {
      const invDucats = buildInventoryDucats(res.inventory, cache.catalog, market, priceCache);
      const mastered = new Set([
        ...(res.inventory.XPInfo || []).map(e => e.ItemType),
        ...(res.inventory.Suits || []).map(e => e.ItemType),
        ...(res.inventory.Weapons || []).map(e => e.ItemType),
        ...(res.inventory.SpaceSuits || []).map(e => e.ItemType),
        ...(res.inventory.SpaceWeapons || []).map(e => e.ItemType),
        ...(res.inventory.MechSuits || []).map(e => e.ItemType)
      ]);
      sets = buildPrimeSets(market, priceCache, invDucats.items, {
        onlyOwned: true,
        catalog: cache.catalog,
        mastered
      });
    }
  } catch (err) {
    console.warn('[Inventory] Sets-Erstellung fehlgeschlagen:', err.message);
  }

  view.sections.sets = sets;
  view.totals.sets = {
    arten: sets.length,
    stueck: sets.reduce((sum, s) => sum + s.ownedParts, 0),
    complete: sets.filter(s => s.complete).length
  };

  return {
    ok: true,
    data: {
      ...view,
      sectionMeta: SECTIONS,
      source: res.source || 'api',
      fetchedAt: res.fetchedAt,
      /* Wartezeit gehoert in die Oberflaeche, damit der Knopf erklaeren kann,
         warum er gerade nichts tut. */
      gate: {
        allowed: gate.allowed,
        reason: gate.reason || null,
        message: gate.message || null,
        waitText: gate.allowed ? null : formatWait(gate.waitMs)
      },
      message: res.message || null
    }
  };
}

ipcMain.handle('inventory:get', async () => {
  try {
    return await inventoryPayload({ refresh: false });
  } catch (err) {
    /* "Noch nie abgerufen" ist kein Fehler, sondern ein Zustand. */
    return { ok: false, code: err.code || 'empty', error: err.message };
  }
});

ipcMain.handle('inventory:refresh', async () => {
  try {
    /* Die Sperre sitzt hier und nicht in inventory.js: core/ kennt die
       Konfiguration nicht, und das soll so bleiben. Wichtiger aber - hier
       ist die Stelle, VOR der noch kein fremder Prozess angefasst wurde.
       Ein "abgelehnt" hinter dem Speicherzugriff waere wertlos. */
    const cfg = await loadConfig();
    if (cfg.inventoryScan !== true) {
      return { ok: false, code: 'scan_disabled', error: INVENTORY_ERRORS.scan_disabled };
    }
    return await inventoryPayload({ refresh: true });
  } catch (err) {
    const code = err.code || (err.rateLimited ? 'rate_limited' : 'unknown');
    return { ok: false, code, error: INVENTORY_ERRORS[code] || err.message };
  }
});

/**
 * Datenblatt einer Mod- oder Arcane-Karte.
 *
 * `owned` reicht die Oberflaeche mit herein: sie hat den Inventar-Eintrag mit
 * Anzahl und Raengen bereits vorliegen. Ihn hier neu aus der Inventardatei zu
 * ziehen, hiesse ein Megabyte JSON pro Klick zu lesen.
 *
 * Die Droptabellen sind ABSICHTLICH kein Grund zum Scheitern: ohne Netz oder
 * beim allerersten Start gibt es die Datei noch nicht. Dann fehlen eben die
 * Fundorte - Wirkung und Werte stehen trotzdem da.
 */
ipcMain.handle('upgrade:details', async (_e, uniqueName, owned = null) => {
  try {
    if (!cache.catalog) await ensureData({ refresh: false });

    let dropNote = null;
    if (!cache.dropTables) {
      try {
        cache.dropTables = await loadDropTables({});
      } catch (err) {
        dropNote = `Drop locations unavailable: ${err.message}`;
      }
    }

    const data = upgradeDetails(uniqueName, cache.catalog, cache.dropTables, owned);
    if (!data) return { ok: false, error: 'Card not found in the catalogue.' };

    /* Im Datenblatt ist Platz fuer die grosse Karte - dieselbe Quelle wie im
       Raster, nur in doppelter Breite. */
    if (!cache.cards) cache.cards = await loadCardImages({}).catch(() => null);
    const card = cardUrl(cache.cards, data, data.kind === 'arcane' ? 256 : 310);

    return { ok: true, data: { ...data, card, dropNote } };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

/* Die Politur-Stufen heissen in DEs Daten wie im englischen Spiel. Die
   Zuordnung bleibt als die eine Stelle stehen, an der eine Umbenennung durch
   DE aufzufangen waere. */
const RELIC_STATE_LABELS = {
  Intact: 'Intact', Exceptional: 'Exceptional',
  Flawless: 'Flawless', Radiant: 'Radiant'
};

/**
 * Datenblatt eines Relikts.
 *
 * Die vier Politur-Stufen zeigen DIESELBEN sechs Belohnungen mit anderen
 * Chancen - strahlend hebt die seltene von 2 % auf 10 %. Deshalb wird nicht
 * eine Stufe ausgerechnet, sondern alle vier: die Frage vor dem Oeffnen ist
 * ja gerade, ob sich das Polieren lohnt.
 */
ipcMain.handle('relic:details', async (_e, uniqueName) => {
  try {
    if (!cache.catalog) cache.catalog = await loadCatalog();

    const market = await loadMarketItems().catch(() => null);
    const resolved = resolveInventoryRelic(market, uniqueName);
    if (!resolved?.key) return { ok: false, error: 'Relic not recognised.' };

    const [relicIdx, priceCache] = await Promise.all([loadRelicTables(), readPriceCache()]);
    const lookup = relicRewardLookup(market, priceCache, cache.catalog);

    /* Bestand je Stufe: das eigene Inventar weiss, wie viele intakte und wie
       viele strahlende danebenliegen. */
    const invRes = await loadInventory({ refresh: false }).catch(() => null);
    const owned = ownedRelics(invRes?.inventory, market);

    const states = RELIC_STATES.map(state => {
      const table = rewardsFor(relicIdx, resolved.key, state);
      const value = table ? relicExpectation(table.rewards, lookup) : null;
      return {
        state,
        label: RELIC_STATE_LABELS[state] || state,
        count: owned.get(resolved.key + '|' + state)?.count || 0,
        rewards: value?.rewards || [],
        expPlat: value?.expPlat ?? null,
        expDucats: value?.expDucats ?? null,
        pricedShare: value?.pricedShare ?? 0
      };
    });

    /* Steht das Relikt nicht mehr in den Droptabellen, ist es vaulted - dann
       gibt es keine Belohnungsliste und auch keinen Fundort. */
    const vaulted = !relicIdx?.byKey?.has(resolved.key);

    let sources = { groups: [], origin: null };
    if (!vaulted) {
      if (!cache.dropTables) cache.dropTables = await loadDropTables({}).catch(() => null);
      sources = sourcesFor(cache.dropTables, { name: `${resolved.key} Relic` });
    }

    const [tier, ...rest] = resolved.key.split(' ');
    return {
      ok: true,
      data: {
        key: resolved.key,
        tier,
        name: rest.join(' '),
        /* Die Marktliste haengt "Relic" an jeden Namen. Im Inventar steht
           daneben schlicht "Axi A22" - im Datenblatt soll dasselbe stehen. */
        displayName: (resolved.displayName || resolved.key).replace(/\s*Relic$/i, ''),
        image: relicImage(resolved.base, resolved.state),
        currentState: resolved.state,
        states,
        vaulted,
        sources,
        total: states.reduce((sum, s) => sum + s.count, 0)
      }
    };
  } catch (err) {
    return { ok: false, code: err.code || null, error: err.message };
  }
});

/* ---------------------------- Builds ---------------------------- */

async function buildsPayload() {
  const st = await store.load();
  const owned = new Set(st.ownedMods);
  const lookup = u => cache.catalog.byUniqueName.get(u) || null;
  const combined = combineBuilds(st.builds, cache.mods, owned, lookup);

  return {
    builds: combined.perBuild.map(({ build, evaluation }) => ({
      id: build.id,
      name: build.name,
      itemName: build.itemName,
      itemUniqueName: build.itemUniqueName,
      image: build.itemUniqueName ? imageUrl(build.itemUniqueName, 128) : null,
      source: build.source,
      sourceUrl: build.sourceUrl,
      author: build.author,
      unresolved: build.unresolved || 0,
      capacity: evaluation.capacity,
      used: evaluation.used,
      free: evaluation.free,
      overCapacity: evaluation.overCapacity,
      requirements: evaluation.requirements,
      mods: {
        total: evaluation.mods.total,
        owned: evaluation.mods.owned,
        missing: evaluation.mods.missing
      },
      slots: evaluation.slots
    })),
    totals: combined.totals,
    missingMods: combined.missingMods.map(m => ({
      uniqueName: m.uniqueName, name: m.name, rank: m.rank, maxRank: m.maxRank,
      rarity: m.rarity, rarityLabel: RARITY_LABELS[m.rarity] || m.rarity,
      usedIn: m.usedIn
    })),
    ownedCount: st.ownedMods.length
  };
}

ipcMain.handle('builds:get', async () => {
  try {
    if (!cache.mods) await ensureData({ refresh: false });
    return { ok: true, data: await buildsPayload() };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('builds:import', async (_e, input) => {
  try {
    if (!cache.mods) await ensureData({ refresh: false });
    const { build, scrapeNote } = await importOverframeBuild(input);
    await store.addBuild(build);
    return { ok: true, data: await buildsPayload(), note: scrapeNote, unresolved: build.unresolved };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('builds:remove', async (_e, id) => {
  await store.removeBuild(id);
  return { ok: true, data: await buildsPayload() };
});

/** Eigener Build: 8 normale Slots plus Aura/Stance und Exilus. */
const EMPTY_SLOTS = () => Array.from({ length: 10 }, () => null);

ipcMain.handle('builds:create', async (_e, itemUniqueName, name) => {
  try {
    if (!cache.mods) await ensureData({ refresh: false });
    const item = cache.catalog.byUniqueName.get(itemUniqueName);
    if (!item) return { ok: false, error: 'Item not found.' };

    await store.addBuild({
      name: name || `${item.name}-Build`,
      itemUniqueName: item.uniqueName,
      itemName: item.name,
      itemRank: item.maxLevelCap || 30,
      orokin: true,
      slots: EMPTY_SLOTS(),
      source: 'manual'
    });
    return { ok: true, data: await buildsPayload() };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('builds:setSlot', async (_e, buildId, slotIndex, slot) => {
  try {
    const st = await store.load();
    const b = st.builds.find(x => x.id === buildId);
    if (!b) return { ok: false, error: 'Build not found.' };

    const slots = Array.isArray(b.slots) ? [...b.slots] : EMPTY_SLOTS();
    while (slots.length < 10) slots.push(null);
    slots[slotIndex] = slot;                        // null loescht den Slot

    await store.updateBuild(buildId, { slots });
    return { ok: true, data: await buildsPayload() };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('builds:setMeta', async (_e, buildId, patch) => {
  await store.updateBuild(buildId, patch);
  return { ok: true, data: await buildsPayload() };
});

/** Mod-Suche fuer den Editor - passende Mods des Items zuerst. */
ipcMain.handle('mods:search', async (_e, query, itemUniqueName) => {
  if (!cache.mods) await ensureData({ refresh: false });
  const item = itemUniqueName ? cache.catalog.byUniqueName.get(itemUniqueName) : null;
  const found = searchMods(cache.mods, query, { category: item?.productCategory || null });
  const st = await store.load();
  const owned = new Set(st.ownedMods);

  return found.map(m => ({
    uniqueName: m.uniqueName,
    name: m.name,
    compatName: m.compatName || null,
    baseDrain: m.baseDrain ?? 0,
    maxRank: m.fusionLimit ?? 0,
    polarity: m.polarity || null,
    polaritySymbol: m.polarity ? POLARITIES[m.polarity]?.symbol : null,
    rarity: m.rarity,
    rarityLabel: RARITY_LABELS[m.rarity] || m.rarity,
    isAura: isAuraMod(m),
    isExilus: isExilusMod(m),
    owned: owned.has(m.uniqueName),
    description: m.description || ''
  }));
});

/** Item-Suche fuer "neuen Build anlegen". */
ipcMain.handle('items:forBuild', async (_e, query) => {
  if (!cache.analysis) await ensureData({ refresh: false });
  const q = String(query || '').toLowerCase().trim();
  if (q.length < 2) return [];
  return cache.analysis.entries
    .filter(e => (e.name || '').toLowerCase().includes(q))
    .slice(0, 25)
    .map(e => ({
      uniqueName: e.uniqueName,
      name: e.name,
      label: CATEGORY_LABELS[e.category] || e.category,
      image: imageUrl(e.uniqueName, 128)
    }));
});

/** Alle Polaritaeten fuer die Auswahl im Editor. */
ipcMain.handle('mods:polarities', () =>
  Object.entries(POLARITIES).map(([key, v]) => ({ key, ...v })));

ipcMain.handle('mods:setOwned', async (_e, uniqueName, owned) => {
  await store.setModOwned(uniqueName, owned);
  return { ok: true, data: await buildsPayload() };
});

ipcMain.handle('mods:setManyOwned', async (_e, list, owned) => {
  await store.setManyModsOwned(list, owned);
  return { ok: true, data: await buildsPayload() };
});

ipcMain.handle('window:overlay',      () => toggleOverlay());
ipcMain.handle('window:overlayState', () => overlayState());
ipcMain.handle('window:clickThrough', (_e, on) => {
  clickThrough = !!on;
  applyMousePassthrough(clickThrough);
  rememberOverlayLayout();
  broadcastOverlayState();
  return overlayState();
});
/* Der Renderer meldet, ob der Zeiger ueber dem Overlay steht. Nur so laesst
   sich der Durchlass kurzzeitig aufheben, damit die Bedienelemente ueberhaupt
   noch anklickbar sind. */
ipcMain.handle('window:hover', (_e, over) => {
  /* Im Zeigermodus ist der Durchlass ohnehin ausgesetzt - ein spaet
     eintreffendes "Zeiger ist weg" wuerde ihn sonst wieder einschalten. */
  if (clickThrough && !interacting) applyMousePassthrough(!over);
  return null;
});
ipcMain.handle('window:opacity', (_e, value) => {
  overlayOpacity = clampOpacity(value);
  if (overlayWin && !overlayWin.isDestroyed()) overlayWin.setOpacity(overlayOpacity);
  rememberOverlayLayout();
  broadcastOverlayState();
  return overlayState();
});
ipcMain.handle('window:interact', (_e, on) => setInteracting(on));
ipcMain.handle('window:hotkey',   () => ({ ...hotkeys }));

/* ----------------------- Relikt-Belohnungen ----------------------- */

/**
 * Log-Pfad einer Belohnung in etwas Anzeigbares verwandeln.
 *
 * Das Log schreibt unter /Lotus/StoreItems/..., der Katalog fuehrt dieselbe
 * Sache ohne diesen Abschnitt - ohne das Abschneiden findet man nichts.
 */
async function describeReward(uniqueName) {
  const clean = uniqueName.replace('/StoreItems', '');
  if (!cache.catalog) cache.catalog = await loadCatalog();

  const item = cache.catalog.byUniqueName.get(clean);
  const name = item?.name || clean.split('/').pop();

  let ducats = null, slug = null;
  try {
    const market = await loadMarketItems();
    const hit = findMarketItem(market, { uniqueName: clean, name });
    if (hit) { ducats = hit.ducats ?? null; slug = hit.slug; }
  } catch {
    /* Ohne Marktliste bleiben Name und Bild - besser als gar keine Anzeige. */
  }

  return { uniqueName: clean, name, image: imageUrl(clean, 128), ducats, slug };
}

function sendToOverlay(channel, payload) {
  if (overlayWin && !overlayWin.isDestroyed()) overlayWin.webContents.send(channel, payload);
}

/** Kandidatenfeld fuer die Bildschirmerkennung, einmal gebaut. */
async function ensureRewardIndex() {
  if (rewardIndex) return rewardIndex;
  const relics = await loadRelicTables();
  rewardIndex = buildRewardIndex(allRewardNames(relics));
  return rewardIndex;
}

/**
 * Löst ein Prime-Teil oder Belohnung in das übergeordnete Set auf:
 * Set-Komponenten, Besitzanzahl im Inventar und ob das Hauptitem gemeistert/gebaut wurde.
 */
async function resolveSetDetails(name, uniqueName) {
  let isCrafted = false;
  let currentOwned = 0;
  let currentRequired = 1;
  let setParts = [];

  try {
    const catalog = await loadCatalog().catch(() => null);
    let inv = null;
    try {
      const invRes = await loadInventory({ refresh: false }).catch(() => null);
      inv = invRes?.inventory || null;
    } catch {}

    const ownedCounts = new Map();
    const masteredTypes = new Set();

    if (inv) {
      for (const row of inv.MiscItems || []) {
        if (row.ItemType) ownedCounts.set(row.ItemType, (ownedCounts.get(row.ItemType) || 0) + (row.ItemCount || 1));
      }
      for (const row of inv.Recipes || []) {
        if (row.ItemType) ownedCounts.set(row.ItemType, (ownedCounts.get(row.ItemType) || 0) + (row.ItemCount || 1));
      }
      for (const xp of inv.XPInfo || []) {
        if (xp.ItemType) masteredTypes.add(xp.ItemType);
      }
      for (const list of [inv.Suits, inv.LongGuns, inv.Pistols, inv.Melee, inv.SpaceSuits, inv.SpaceGuns, inv.SpaceMelee, inv.Sentinels, inv.SentinelWeapons]) {
        for (const item of list || []) {
          if (item.ItemType) masteredTypes.add(item.ItemType);
        }
      }
    }

    if (catalog) {
      let primeItem = null;
      const match = name.match(/^(.+?\s+Prime)\b/i);
      const baseName = match ? match[1] : null;

      if (baseName) {
        primeItem = catalog.items.find(it => it.name?.toLowerCase() === baseName.toLowerCase());
      }
      if (!primeItem && uniqueName) {
        primeItem = catalog.byUniqueName.get(uniqueName);
      }

      if (primeItem) {
        isCrafted = masteredTypes.has(primeItem.uniqueName);
        const recipe = catalog.recipeFor.get(primeItem.uniqueName);

        if (recipe) {
          // 1. Haupt-Blueprint
          const bpUnique = recipe.uniqueName;
          const bpCount = ownedCounts.get(bpUnique) || 0;
          const bpName = primeItem.name + ' Blueprint';
          const isBpCur = name.toLowerCase() === bpName.toLowerCase() || name.toLowerCase() === 'blueprint' || bpUnique === uniqueName;
          if (isBpCur) {
            currentOwned = bpCount;
            currentRequired = 1;
          }

          setParts.push({
            name: bpName,
            shortName: 'Blueprint',
            uniqueName: bpUnique,
            image: imageUrl(bpUnique, 64),
            count: bpCount,
            required: 1,
            isCurrent: isBpCur
          });

          // 2. Zutaten / Unter-Komponenten
          for (const ing of recipe.ingredients || []) {
            const ingUnique = ing.ItemType;
            if (isRawMaterial(ingUnique)) continue;
            const subRec = catalog.recipeFor.get(ingUnique);
            const ingItem = catalog.byUniqueName.get(ingUnique);
            let targetUnique = ingUnique;
            let count = (ownedCounts.get(ingUnique) || 0);

            if (subRec) {
              targetUnique = subRec.uniqueName;
              count += (ownedCounts.get(subRec.uniqueName) || 0);
            }

            let partName = ingItem?.name || ingUnique.split('/').pop();
            if (subRec && !partName.includes('Blueprint')) {
              partName += ' Blueprint';
            }
            const shortName = partName.replace(primeItem.name, '').replace('Blueprint', '').trim() || partName;

            const isCur = name.toLowerCase().includes(shortName.toLowerCase()) || targetUnique === uniqueName || ingUnique === uniqueName;
            if (isCur) {
              currentOwned = count;
              currentRequired = ing.ItemCount || 1;
            }

            setParts.push({
              name: partName,
              shortName: shortName,
              uniqueName: targetUnique,
              image: imageUrl(targetUnique, 64),
              count: count,
              required: ing.ItemCount || 1,
              isCurrent: isCur
            });
          }
        }
      } else {
        if (uniqueName) {
          isCrafted = masteredTypes.has(uniqueName);
          currentOwned = ownedCounts.get(uniqueName) || 0;
        }
      }
    }
  } catch (err) {
    console.error('[Relikt] Fehler beim Auflösen des Sets:', err.message);
  }

  return { isCrafted, currentOwned, currentRequired, setParts };
}

/** Erkannter Name -> Anzeige mit Bild, Dukaten, Markt-Kennung und Set-Details. */
async function describeScanned(name) {
  let image = null, ducats = null, slug = null, uniqueName = null;
  try {
    const market = await loadMarketItems();
    const hit = findMarketItem(market, { name });
    if (hit) {
      slug = hit.slug;
      ducats = hit.ducats ?? null;
      /* gameRef ist DEs uniqueName - damit kommt man an dasselbe Bild, das
         der Katalog fuer dieses Teil fuehrt. */
      uniqueName = hit.gameRef || null;
      if (uniqueName) image = imageUrl(uniqueName, 128);
    }
  } catch { /* Name allein ist besser als nichts. */ }

  const setInfo = await resolveSetDetails(name, uniqueName);

  return {
    name,
    image,
    ducats,
    slug,
    uniqueName,
    isCrafted: setInfo.isCrafted,
    currentOwned: setInfo.currentOwned,
    currentRequired: setInfo.currentRequired,
    setParts: setInfo.setParts
  };
}

/** Aktuellen Stand an das Overlay schicken. Immer vollstaendig, nie in Teilen. */
function pushRelic() {
  sendToOverlay('relic:reward', currentRelic);
}

function startLogWatcher() {
  logWatcher = new LogWatcher();

  logWatcher.on('relic-reward', ev => { handleRelicReward(ev).catch(err => {
    console.error('[Relikt] Ablauf abgebrochen:', err.message);
  }); });

  logWatcher.on('relic-timer', ev => sendToOverlay('relic:timer', ev));

  logWatcher.on('relic-closed', () => {
    currentRelic = null;
    hideTags();
    sendToOverlay('relic:closed', {});
    if (overlayShownForRelic) {
      overlayShownForRelic = false;
      hideOverlay();
    }
  });

  logWatcher.start();
}

/**
 * Der Ablauf einer Relikt-Belohnung, von der Logzeile bis zu den Preisen.
 *
 * Eigene Funktion und nicht der Ereignisbehandler selbst: ein async-Handler
 * meldet seine Ausnahmen niemandem. Ein vergessenes Feld liess hier die halbe
 * Anzeige stillschweigend ausfallen - sichtbar wurde es erst im stderr des
 * Hauptprozesses.
 */
async function handleRelicReward(ev) {
    const own = ev.uniqueName ? await describeReward(ev.uniqueName) : null;

    /* Sofort zeigen, was ohne Netz und ohne Bildschirm feststeht: der eigene
       Fund aus dem Log. Alles andere kommt in den naechsten Sekunden dazu. */
    currentRelic = {
      seconds: ev.seconds, at: Date.now(),
      own, rewards: [], scanning: relicScan, scanError: null
    };
    /* Knappe Protokollzeilen: ohne sie ist bei einem Fehlschlag nicht
       unterscheidbar, ob das Log nichts hergab, die Erkennung nichts fand
       oder die Anzeige klemmt. */
    console.log('[Relikt] Fund aus Log:', own ? own.name : '-',
                '| Erkennung:', relicScan ? 'an' : 'aus',
                '| Schilder:', relicTags ? 'an' : 'aus');
    pushRelic();

    /* Sind die Schilder an, sitzt die Information schon im Spiel - dann muss
       nicht zusaetzlich das grosse Fenster aufspringen. */
    if (relicAutoShow && !relicTags && !overlayVisible()) {
      overlayShownForRelic = true;
      showOverlay();
    }

    /* Der eigene Fund zuerst - er ist schon bekannt, der Preis fehlt nur noch. */
    if (own?.slug) {
      const price = await getPrice(own.slug).catch(() => null);
      if (currentRelic?.own?.uniqueName === own.uniqueName) {
        currentRelic.own.price = price;
        pushRelic();
      }
    }

    if (!relicScan) return;

    /* Und jetzt der Bildschirm: die drei Funde der Mitspieler stehen nirgends
       sonst. Rund 1,3 s fuer Aufnahme und Erkennung. */
    const started = currentRelic;
    const scan = await scanRewardScreen(await ensureRewardIndex());
    if (currentRelic !== started) return;   // inzwischen kam eine neue Runde

    console.log('[Relikt] Erkennung:',
                scan.ok ? scan.rewards.length + ' Treffer' : 'Fehler ' + scan.error);

    if (!scan.ok) {
      currentRelic.scanning = false;
      currentRelic.scanError = scan.error;
      pushRelic();
      return;
    }

    const ownName = own?.name || null;
    currentRelic.rewards = await Promise.all(scan.rewards.map(async r => ({
      ...(await describeScanned(r.name)),
      position: r.position,
      score: r.score,
      /* box muss mit: daran haengt die Position der Preisschilder im Spiel.
         Ohne diese Zeile bekommt showTags Eintraege ohne Rahmen. */
      box: r.box,
      isOwn: !!ownName && r.name === ownName,
      price: null
    })));
    currentRelic.scanning = false;
    currentRelic.region = scan.region || null;
    pushRelic();
    showTags(currentRelic.rewards, currentRelic.region);

    /* Preise einzeln nachreichen, damit weder Liste noch Schilder auf den
       letzten Abruf warten. */
    for (const reward of currentRelic.rewards) {
      if (!reward.slug) continue;
      const price = await getPrice(reward.slug).catch(() => null);
      if (currentRelic !== started) return;
      reward.price = price;
      pushRelic();
      showTags(currentRelic.rewards, currentRelic.region);
    }
}

/* -------------------------- Einstellungen -------------------------- */

ipcMain.handle('settings:get', async () => {
  const st = await store.load();
  return { ok: true, hotkeys: { ...hotkeys }, notifications: st.notifications, relicAutoShow, relicScan, relicTags };
});

ipcMain.handle('settings:relicTags', async (_e, on) => {
  relicTags = !!on;
  if (!relicTags) hideTags();
  try {
    const cfg = await loadConfig();
    await saveConfig({ ...cfg, relicTags });
  } catch { /* nicht gespeichert, aber aktiv */ }
  return { ok: true, relicTags };
});

ipcMain.handle('settings:relicScan', async (_e, on) => {
  relicScan = !!on;
  try {
    const cfg = await loadConfig();
    await saveConfig({ ...cfg, relicScan });
  } catch { /* nicht gespeichert, aber aktiv */ }
  return { ok: true, relicScan };
});

/* Wird beim Start des Overlay-Renderers abgefragt. Die Restzeit wird neu
   gerechnet: zwischen Fund und fertig geladenem Fenster vergeht knapp eine
   Sekunde, und von fuenfzehn ist das spuerbar. */
ipcMain.handle('relic:current', () => {
  if (!currentRelic) return null;
  const left = currentRelic.seconds - (Date.now() - currentRelic.at) / 1000;
  if (left <= 0) return null;
  return { ...currentRelic, seconds: left };
});

ipcMain.handle('settings:relicAutoShow', async (_e, on) => {
  relicAutoShow = !!on;
  try {
    const cfg = await loadConfig();
    await saveConfig({ ...cfg, relicAutoShow });
  } catch { /* nicht gespeichert, aber aktiv */ }
  return { ok: true, relicAutoShow };
});

ipcMain.handle('settings:hotkeys', async (_e, patch) => {
  const res = applyHotkeys(patch || {});
  try {
    const cfg = await loadConfig();
    await saveConfig({ ...cfg, hotkeys: { ...hotkeys } });
  } catch {
    /* Nicht gespeichert, aber aktiv - nach dem naechsten Start gilt wieder
       der alte Wert. Besser als der Abbruch einer laufenden Aenderung. */
  }
  /* Das Overlay zeigt das Kuerzel in seiner Hinweiszeile an. */
  broadcastOverlayState();
  return { ok: true, ...res };
});
ipcMain.handle('window:minimize', () => win && win.minimize());
ipcMain.handle('window:close',    () => win && win.close());

/* -------------------- Void-Riss Benachrichtigungen -------------------- */

const seenFissureIds = new Set();
let trackerInitialized = false;
let notificationPollerTimer = null;

async function triggerFissureNotification(fissure, settings) {
  const iconPath = path.join(__dirname, '../renderer/assets/icons/worldstate/fissure.png');
  const title = `Void fissure active: ${fissure.tier} · ${fissure.missionType}`;
  const body = `${fissure.node} (${fissure.enemy || 'Befallen/Korrumpiert'})${fissure.isHard ? ' · [Steel Path]' : ''}\nRestzeit: ${fissure.eta || 'jetzt live'}`;

  // Native Windows Notification Toast
  if (settings.desktopToast !== false && Notification.isSupported()) {
    try {
      const n = new Notification({
        title,
        body,
        icon: iconPath,
        silent: !settings.sound
      });
      n.on('click', () => {
        if (win) {
          if (win.isMinimized()) win.restore();
          win.show();
          win.focus();
          win.webContents.send('navigate:tab', 'worldstate', 'fissures');
        }
      });
      n.show();
    } catch (err) {
      console.error('Fehler beim Anzeigen der Benachrichtigung:', err);
    }
  }

  // IPC Event an Renderer senden (für In-App Toast & Badge)
  if (win && win.webContents) {
    win.webContents.send('notification:event', {
      type: 'fissure',
      title,
      body,
      fissure
    });
  }
}

async function pollFissureTracker() {
  try {
    const ws = await fetchWorldState({ force: false });
    if (!ws || !ws.fissures) return;

    const st = await store.load();
    const settings = st.notifications;

    const currentFissureIds = new Set(ws.fissures.map(f => f.id));

    if (!trackerInitialized) {
      // Beim ersten Start merken wir uns die bereits aktiven Risse, damit nicht sofort 15 Toasts aufpoppen
      ws.fissures.forEach(f => seenFissureIds.add(f.id));
      trackerInitialized = true;
      return;
    }

    // Prüfen, ob neue Risse dazugekommen sind
    for (const f of ws.fissures) {
      if (!seenFissureIds.has(f.id)) {
        seenFissureIds.add(f.id);
        if (matchesFissureFilter(f, settings)) {
          await triggerFissureNotification(f, settings);
        }
      }
    }

    // Alte Riss-IDs aus seenFissureIds aufräumen
    for (const id of seenFissureIds) {
      if (!currentFissureIds.has(id)) {
        seenFissureIds.delete(id);
      }
    }
  } catch {
    // Fehler bei Hintergrundabruf stillschweigend ignorieren
  }
}

ipcMain.handle('notifications:get', async () => {
  const st = await store.load();
  return st.notifications;
});

ipcMain.handle('notifications:save', async (_e, patch) => {
  const st = await store.updateNotificationSettings(patch);
  // Sofort prüfen, ob die neuen Einstellungen matchen
  pollFissureTracker();
  return { ok: true, data: st.notifications };
});

ipcMain.handle('notifications:test', async () => {
  const st = await store.load();
  const settings = st.notifications || {};
  const iconPath = path.join(__dirname, '../renderer/assets/icons/worldstate/fissure.png');

  const testFissure = {
    id: 'test-fissure-' + Date.now(),
    tier: 'Axi',
    missionType: 'Void Cascade',
    node: 'Teshub (Zariman)',
    enemy: 'Grineer',
    isHard: true,
    isStorm: false,
    eta: '54m'
  };

  const title = `[Test] Void fissure active: Axi · Void Cascade`;
  const body = `Teshub (Zariman) · [Steel Path]\nRestzeit: 54m (Test-Benachrichtigung)`;

  if (Notification.isSupported()) {
    try {
      const n = new Notification({
        title,
        body,
        icon: iconPath,
        silent: !settings.sound
      });
      n.on('click', () => {
        if (win) {
          if (win.isMinimized()) win.restore();
          win.show();
          win.focus();
          win.webContents.send('navigate:tab', 'worldstate', 'fissures');
        }
      });
      n.show();
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  if (win && win.webContents) {
    win.webContents.send('notification:event', {
      type: 'test',
      title,
      body,
      fissure: testFissure
    });
  }

  return { ok: true };
});

/* ---------------------------- App ---------------------------- */

if (process.platform === 'win32') {
  app.setAppUserModelId('com.kr3akz.cephalonargus');
}

app.whenReady().then(async () => {
  await loadOverlayPrefs();
  createWindow();
  // Hotkey zum Ein-/Ausblenden waehrend des Spielens
  applyHotkeys();

  /* Schon beim Start anlegen, versteckt: beim ersten Fund soll das Fenster
     fertig geladen sein und nur noch gezeigt werden muessen. */
  createTagWindow();

  /* Liest ab jetzt EE.log mit - beginnt am Dateiende, damit nicht die
     Belohnung von vorgestern als frischer Fund erscheint. */
  startLogWatcher();

  // Hintergrund-Überwachung für Void-Risse starten (alle 45 Sekunden)
  pollFissureTracker();
  notificationPollerTimer = setInterval(pollFissureTracker, 45000);

  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});

app.on('will-quit', () => {
  if (logWatcher) logWatcher.stop();
  if (notificationPollerTimer) clearInterval(notificationPollerTimer);
  globalShortcut.unregisterAll();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

