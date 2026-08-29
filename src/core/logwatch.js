/**
 * Beobachtet Warframes EE.log und meldet Relikt-Belohnungen.
 *
 * WAS IM LOG STEHT (nachgemessen an einer echten Riss-Mission):
 *   VoidProjections: OpenVoidProjectionRewardScreenRMI
 *   ProjectionRewardChoice.lua: Relic rewards initialized
 *   VoidProjections: <accountId> gets reward /Lotus/StoreItems/.../PrimeBowGrip
 *   VoidProjections: Client got reward info from <accountId>      (x4)
 *   ProjectionRewardChoice.lua: Got rewards
 *   ProjectionsCountdown.lua: Initialize timer nil  15
 *   ProjectionRewardChoice.lua: Relic reward screen shut down
 *
 * WAS NICHT DRINSTEHT:
 *   Die Belohnungen der drei Mitspieler. Deren Daten kommen ueber das Netz an
 *   ("Client got reward info from"), werden aber nie mit Item protokolliert.
 *   Wer alle vier Namen will, braucht Texterkennung auf dem Bildschirm oder
 *   Lesezugriff auf den Spielspeicher. Der eigene Fund dagegen steht exakt da -
 *   ohne Raten, ohne Bilderkennung, ohne den Spielprozess anzufassen.
 *
 * ZUGANGSDATEN:
 *   Die Zeile enthaelt AccountIds - die eigene und die der Mitspieler. Sie
 *   werden hier verworfen und nie weitergereicht; aus dem Log verlaesst nur
 *   der Item-Pfad dieses Modul.
 *
 * LESEZUGRIFF:
 *   Nur lesend, nur ab dem zuletzt gelesenen Byte. Die Datei bleibt in der
 *   Hand des Spiels; sie wird weder gesperrt noch veraendert noch gedreht.
 */
import { EventEmitter } from 'node:events';
import { open, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

/* ARGUS_EE_LOG zeigt auf eine andere Datei. Gedacht fuer zwei Faelle: eine
   Warframe-Installation mit abweichendem Datenpfad, und der Test der Kette
   ohne echte Riss-Mission - dann laeuft der Beobachter auf einer Kopie, statt
   in die Logdatei des laufenden Spiels zu schreiben. */
export const DEFAULT_LOG_PATH = () =>
  process.env.ARGUS_EE_LOG ||
  path.join(process.env.LOCALAPPDATA || '', 'Warframe', 'EE.log');

/* Schnelle Polling-Rate (150ms) fuer sofortige Reaktion bei Reliktauswahl. */
const POLL_MS = 150;

/* Zwischen "gets reward" und "Got rewards" liegen Millisekunden. Ein aelterer
   Fund gehoert zu einer frueheren Mission und wird nicht mehr angezeigt. */
const REWARD_MAX_AGE_MS = 30000;

/* Notbremse fuer die Reliktauswahl: bleibt das Schlusssignal aus, schliesst
   sie die Uhr. Fuenf Minuten sind laenger, als irgendjemand vor der Auswahl
   steht, und kurz genug, dass eine haengende Anzeige nicht den Abend ueberlebt. */
const SELECT_MAX_MS = 5 * 60 * 1000;

/* Entprellung fuer game-activity: Zonenwechsel erzeugen oft mehrere Zeilen
   innerhalb weniger Millisekunden. Nur das erste Ereignis in diesem Fenster
   wird emittiert. */
const ACTIVITY_DEBOUNCE_MS = 5000;

/* ----- Spielereignisse, die auf ein veraendertes Inventar hindeuten ----- */
const RE_MISSION_END = /MatchingService::LeaveSquad/;
const RE_ORBITER     = /(?:TennoShipAvatar|TennoMotion).*Setting PM_|Created\s+\S*ThemedMainMenu\.swf/;
const RE_TRADE       = /TradeService::\w*(?:Accept|Confirm|Complete)/i;

const RE_OWN_REWARD = /VoidProjections:\s+[0-9a-f]{24}\s+gets reward\s+(\S+)/;
const RE_READY      = /ProjectionRewardChoice\.lua:\s*Got rewards/;

/**
 * Wie viele Karten auf dem Bildschirm stehen werden.
 *
 * Eine pro Mitspieler, und das Log zaehlt sie mit: fuer jeden trifft genau eine
 * Zeile "Client got reward info from <accountId>" ein, die eigene inbegriffen.
 *
 * WARUM DAS ZAEHLEN NOETIG IST:
 *   Die Erkennung hoerte auf, sobald VIER Namen dastanden. In einer vollen
 *   Gruppe stimmt das. Zu dritt kommt die Vier nie zustande - dann las sie
 *   stur weiter, bis die Zeit abgelaufen war, und zeigte die drei Karten erst
 *   nach sieben Sekunden statt nach einer halben. Von fuenfzehn Sekunden
 *   Bedenkzeit ist das fast die Haelfte, vertan mit Warten auf eine vierte
 *   Karte, die es nicht gibt.
 *
 * Die AccountIds werden nur gezaehlt, nicht behalten - siehe Kopfkommentar.
 */
const RE_REWARD_PEER = /VoidProjections:\s*Client got reward info from\s+([0-9a-f]{24})/;
const RE_REWARD_OPEN = /VoidProjections:\s*OpenVoidProjectionRewardScreenRMI/;
const RE_TIMER      = /ProjectionsCountdown\.lua:\s*Initialize timer\s+\S+\s+(\d+)/;
const RE_CLOSED     = /ProjectionRewardChoice\.lua:\s*Relic reward screen shut down/;

/**
 * Die Reliktauswahl geht auf.
 *
 * EIN Bildschirm, drei Wege dorthin - und alle drei melden dasselbe:
 *   - Veredelung im Schiff, ueber die Konsole im Relikt-Segment
 *   - Reliktwahl auf der Sternenkarte, bevor eine Rissmission startet
 *   - Reliktwahl zwischen den Runden in Endlos-Missionen
 * In allen dreien baut ThemedProjectionManager das Gitter der eigenen
 * Relikte auf. Etwas anderes darf hier nicht stehen.
 *
 * OHNE UIConsoleTrigger3: hier stand zusaetzlich die Orbiter-Konsole mit
 * genau diesem Index. Der Index ist aber nicht der des Relikt-Segments,
 * sondern eine LAUFENDE NUMMER INNERHALB EINER SZENENEBENE - im Mitschnitt
 * meldet sich das Relikt-Segment als /Layer255/Layer1/Layer31/UIConsoleTrigger3
 * und die Navigation als /Layer255/Layer1/Layer30/UIConsoleTrigger1. Welche
 * Konsole die Nummer 3 traegt, haengt an Ebene und Ausbau des Schiffs. Jede
 * andere Konsole mit derselben Nummer riss damit die Empfehlung auf, ohne
 * dass ein Relikt im Spiel war - das "geht ganz random auf".
 *
 * Gekostet hat der Ausbau nichts: im Mitschnitt folgt dem Konsolen-Ereignis
 * 29 ms spaeter PopulateInventoryGrid. Fuer 29 ms Vorsprung war das der
 * falsche Preis.
 *
 * OHNE DEN BACKGROUND-HERZSCHLAG: "Background.lua: Update the Profile
 * Variable" stand hier lange als Notnagel fuer Bildschirme, die sonst nichts
 * melden. Er ist keiner. Nachgemessen an einem Mitschnitt schlaegt er in
 * unregelmaessigen Abstaenden zu - mal Sekunden, mal Minuten - und traf damit
 * beides: einmal schloss er die Anzeige 4 s BEVOR der Spieler sein Relikt
 * waehlte, ein andermal erst 20 s NACHDEM er den Bildschirm verlassen hatte.
 * Was ihn ersetzt, steht weiter unten (RE_INIT_MAPPING).
 */
const RE_SELECT_OPEN   = /ThemedProjectionManager\.lua:\s*PopulateInventoryGrid|(?:Created|Subscribing for)\s+\S*ThemedProjectionManager\.swf/;

/* Der Gegenzug. UIConsoleTrigger steht jetzt OHNE Nummer hier: aufgehen laesst
   die Auswahl keine Konsole mehr, also heisst jede aufgehende Konsole, dass
   der Spieler woanders ist. */
const RE_SELECT_CLOSED = /Subscribing for \S*ChatRedux\.swf|UIConsoleTrigger::Open\(\)|(?:ThemedMainMenu|RadialSolarMap|PauseMenu|TopMenu)\.lua|(?:TennoShipAvatar|TennoMotion|MotionController|WallSlideController).*Setting PM_|Created\s+\S*(?:Transmission|Dialog|MapRedux|ThemedMainMenu|RadialSolarMap)\.swf|MatchingService::LeaveSquad|Set squad mission/;

/**
 * Der schnelle Schluss: der Eingabefilter wechselt weg vom Menue.
 *
 * Solange die Reliktauswahl offen ist, laeuft die Eingabe ueber einen
 * *MenuInputFilter - der Bildschirm meldet sich beim Aufgehen selbst so an.
 * JEDER Wechsel auf einen anderen Filter heisst deshalb: der Bildschirm ist
 * weg. Zurueck ins Schiff (TennoShipInputFilter), auf die Sternenkarte
 * (MapReduxInputFilter), in die Ausruestung (LoadoutReduxInputFilter) - eine
 * Regel statt einer Liste, die bei jedem neuen Bildschirm nachgezogen
 * werden muesste.
 *
 * Ueber der Sternenkarte fiel das bisher nicht auf: dort folgt auf die Wahl
 * sofort die Sicherheitsfrage ("Are you sure you want to equip ..."), und
 * deren Dialog.swf steht schon in RE_SELECT_CLOSED. Im Schiff gibt es keine
 * solche Frage - dort kam der Schluss erst mit dem Background-Herzschlag an,
 * irgendwann. Genau die Verzoegerung schliesst diese Zeile.
 *
 * SCHARF ERST NACH DER ANMELDUNG (RE_SELECT_ARMED): beim Aufgehen faellt der
 * Filter fuer einen Sekundenbruchteil auf den Schiffsfilter zurueck, BEVOR
 * sich der Bildschirm anmeldet. Wer schon vorher hinsieht, schliesst die
 * Anzeige 0.4 s nach dem Oeffnen wieder.
 */
const RE_INIT_MAPPING  = /InitMapping\b.*\bfilter\s+(\S+)/;
const RE_SELECT_ARMED  = /Subscribing for \S*ThemedProjectionManager\.swf/;

/**
 * Welches Relikt fuer die Mission eingelegt wurde.
 *
 * Die Sicherheitsfrage nennt es beim Namen, mitsamt Politur:
 *   Dialog::CreateOkCancel(description=Are you sure you want to equip
 *   Meso F3 Relic [RADIANT] for this mission? It will be consumed if you
 *   seal the Void Fissure and extract., ...)
 *
 * Ohne Klammer ist es unpoliert. Das VERBRAUCHT wird es erst mit dem
 * Belohnungsbildschirm - deshalb wird hier nur gemerkt, nicht abgezogen
 * (siehe main.js). Im Mitschnitt wechseln sich beide sauber ab: einlegen,
 * Belohnung, einlegen, Belohnung - fuenf Paare hintereinander.
 */
const RE_EQUIP = /Dialog::CreateOkCancel\(description=.*?\bequip\s+(\S+)\s+(\S+)\s+Relic(?:\s+\[([A-Za-z]+)\])?\s+for this mission/;

const STATE_BY_TAG = {
  RADIANT: 'Radiant', FLAWLESS: 'Flawless', EXCEPTIONAL: 'Exceptional', INTACT: 'Intact'
};

export class LogWatcher extends EventEmitter {
  constructor(file = DEFAULT_LOG_PATH()) {
    super();
    this.file = file;
    this.offset = 0;
    this.rest = '';
    this.timer = null;
    this.pendingReward = null;   // { uniqueName, at }
    this.relicSelectActive = false;
    this.relicSelectOpenedAt = 0;
    this.relicSelectArmedAt = 0;
    this.selectGuard = null;      // Notbremse, siehe armSelectGuard()
    this.busy = false;
    this.lastActivity = 0;          // Zeitstempel des letzten game-activity
  }

  /**
   * Beginnt am ENDE der Datei, nicht am Anfang: beim Start soll nicht die
   * letzte Belohnung von vorgestern als frischer Fund erscheinen.
   */
  async start() {
    if (this.timer) return;
    try {
      const st = await stat(this.file);
      this.offset = st.size;
    } catch {
      this.offset = 0;   // Datei kommt vielleicht noch, wenn das Spiel startet
    }
    this.timer = setInterval(() => this.tick(), POLL_MS);
    this.emit('started', { file: this.file });
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    clearTimeout(this.selectGuard);
    this.selectGuard = null;
  }

  async tick() {
    /* Ein langsamer Lesevorgang darf sich nicht mit dem naechsten ueberlappen. */
    if (this.busy) return;
    this.busy = true;
    try {
      await this.readNew();
    } catch {
      /* Datei gerade nicht lesbar (Spielstart, Drehung) - der naechste
         Durchlauf versucht es erneut. */
    } finally {
      this.busy = false;
    }
  }

  async readNew() {
    if (!existsSync(this.file)) { this.offset = 0; return; }

    const st = await stat(this.file);
    /* Kleiner als zuletzt: das Spiel wurde neu gestartet und hat die Datei neu
       angelegt. Ohne diesen Zweig laeuft der Zeiger ins Leere. */
    if (st.size < this.offset) { this.offset = 0; this.rest = ''; }
    if (st.size === this.offset) return;

    const length = st.size - this.offset;
    const fh = await open(this.file, 'r');
    try {
      const buf = Buffer.alloc(length);
      await fh.read(buf, 0, length, this.offset);
      this.offset = st.size;

      /* Der letzte Abschnitt kann mitten in einer Zeile enden - Rest
         aufheben, sonst zerfaellt eine Meldung in zwei unbrauchbare Haelften. */
      const text = this.rest + buf.toString('utf8');
      const lines = text.split(/\r?\n/);
      this.rest = lines.pop() ?? '';

      for (const line of lines) this.handleLine(line);
    } finally {
      await fh.close();
    }
  }

  handleLine(line) {
    const equip = RE_EQUIP.exec(line);
    if (equip) {
      this.emit('relic-equipped', {
        tier: equip[1],
        name: equip[2],
        state: STATE_BY_TAG[(equip[3] || '').toUpperCase()] || 'Intact',
        at: Date.now()
      });
      return;
    }

    /* Ein neuer Belohnungsbildschirm - die Zaehlung beginnt von vorn.
     *
     * UND ER WIRD GEMELDET. Diese Zeile stand hier immer, wurde aber nur zum
     * Zuruecksetzen des Zaehlers benutzt und dann verworfen - dabei ist sie
     * das FRUEHESTE, was das Log ueber den Belohnungsbildschirm zu sagen hat.
     *
     * Nachgemessen an EE.log:
     *   15977.878  OpenVoidProjectionRewardScreenRMI   <- diese Zeile
     *   15978.043  Client got reward info from ...     +165 ms
     *   15978.572  ... gets reward ...                 +694 ms
     *   15978.636  Got rewards                         +758 ms  <- bisheriger Ausloeser
     *
     * Volle 758 Millisekunden lag also fest, dass der Bildschirm aufgeht,
     * bevor irgendetwas passierte. Zum LESEN taugt der Zeitpunkt nicht - die
     * Karten sind dann noch nicht gezeichnet, "Missing icon data!" kommt erst
     * spaeter. Zum ANZEIGEN taugt er sehr wohl: das Dock kann schon dastehen,
     * wenn die Namen eintreffen, statt erst danach aufzugehen.
     */
    if (RE_REWARD_OPEN.test(line)) {
      this.rewardPeers = new Set();
      this.emit('relic-screen-open', { at: Date.now() });
      return;
    }

    const peer = RE_REWARD_PEER.exec(line);
    if (peer) {
      /* Nur die Anzahl zaehlt. Die Kennung dient hier als Unterscheidung
         zwischen zwei Mitspielern und verlaesst dieses Modul nicht. */
      if (!this.rewardPeers) this.rewardPeers = new Set();
      this.rewardPeers.add(peer[1]);
      return;
    }

    const reward = RE_OWN_REWARD.exec(line);
    if (reward) {
      this.pendingReward = { uniqueName: reward[1], at: Date.now() };
      return;
    }

    if (RE_READY.test(line)) {
      const fresh = this.pendingReward &&
        Date.now() - this.pendingReward.at < REWARD_MAX_AGE_MS;

      this.emit('relic-reward', {
        /* Ohne eigenen Fund trotzdem melden: der Bildschirm ist offen, und
           der Countdown allein ist schon etwas wert. */
        uniqueName: fresh ? this.pendingReward.uniqueName : null,
        /* Wie viele Karten zu erwarten sind. 0 heisst "unbekannt" - dann
           soll die Gegenseite ihre eigene Annahme behalten, nicht eine Null
           als Zielmarke nehmen. */
        players: this.rewardPeers ? this.rewardPeers.size : 0,
        seconds: 15,
        at: Date.now()
      });
      this.pendingReward = null;
      this.rewardPeers = null;
      return;
    }

    const timer = RE_TIMER.exec(line);
    if (timer) {
      const seconds = Number(timer[1]);
      /* "Initialize timer nil 0" kommt beim Schliessen - keine neue Laufzeit. */
      if (seconds > 0) this.emit('relic-timer', { seconds });
      return;
    }

    if (RE_CLOSED.test(line)) {
      this.emit('relic-closed', {});
      return;
    }

    const timeMatch = /^(\d+\.\d+)/.exec(line);
    const logSec = timeMatch ? parseFloat(timeMatch[1]) : (Date.now() / 1000);

    if (!this.relicSelectActive && RE_SELECT_OPEN.test(line)) {
      this.relicSelectActive = true;
      this.relicSelectOpenedAt = logSec;
      /* Faengt der Mitschnitt erst bei der Anmeldezeile an - etwa weil die App
         mitten in der Reliktauswahl gestartet wurde -, ist der Bildschirm mit
         genau dieser Zeile schon scharf. Sonst wartet der Schluss auf eine
         Anmeldung, die nicht mehr kommt. */
      this.relicSelectArmedAt = RE_SELECT_ARMED.test(line) ? logSec : 0;
      this.armSelectGuard();
      this.emit('relic-select-open', { at: Date.now() });
      return;
    }

    /* ----- Spielaktivitaet: Missionsende, Orbiter, Handel --------------- */
    const trigger =
      RE_MISSION_END.test(line) ? 'mission_end' :
      RE_ORBITER.test(line)     ? 'orbiter'     :
      RE_TRADE.test(line)       ? 'trade'       : null;

    if (trigger) {
      const now = Date.now();
      if (now - this.lastActivity >= ACTIVITY_DEBOUNCE_MS) {
        this.lastActivity = now;
        this.emit('game-activity', { trigger, at: now });
      }
    }

    if (!this.relicSelectActive) return;

    if (RE_SELECT_ARMED.test(line)) { this.relicSelectArmedAt = logSec; return; }

    /* Die 0.15 s halten die Zeilen ab, die zum Aufgehen selbst gehoeren -
       der Bildschirm meldet beim Oeffnen seinen eigenen Eingabefilter an. */
    if (logSec - this.relicSelectOpenedAt <= 0.15 && logSec >= this.relicSelectOpenedAt) return;

    const mapping = this.relicSelectArmedAt && logSec > this.relicSelectArmedAt
      ? RE_INIT_MAPPING.exec(line)
      : null;
    const leftMenu = mapping && !/MenuInputFilter$/.test(mapping[1]);

    if (leftMenu || RE_SELECT_CLOSED.test(line)) this.closeSelect();
  }

  closeSelect() {
    if (!this.relicSelectActive) return;
    this.relicSelectActive = false;
    clearTimeout(this.selectGuard);
    this.selectGuard = null;
    this.emit('relic-select-closed', { at: Date.now() });
  }

  /**
   * Notbremse gegen eine Anzeige, die stehen bleibt.
   *
   * Der Schluss haengt an einer Logzeile. Bleibt die aus - das Spiel stuerzt
   * ab, DE benennt eine Zeile um, das Log wird gedreht -, klebt die Empfehlung
   * ueber dem Bild und niemand wird sie los ausser ueber die Tastenkombination.
   * Ueber einem laufenden Spiel ist das die schlechteste aller Eigenschaften,
   * deshalb entscheidet ab jetzt die Uhr mit.
   *
   * Grosszuegig bemessen: vor einer Rissmission steht man auch mal zwei
   * Minuten vor seinen Relikten und rechnet.
   */
  armSelectGuard() {
    clearTimeout(this.selectGuard);
    this.selectGuard = setTimeout(() => this.closeSelect(), SELECT_MAX_MS);
    this.selectGuard.unref?.();
  }
}
