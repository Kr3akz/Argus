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

const RE_OWN_REWARD = /VoidProjections:\s+[0-9a-f]{24}\s+gets reward\s+(\S+)/;
const RE_READY      = /ProjectionRewardChoice\.lua:\s*Got rewards/;
const RE_TIMER      = /ProjectionsCountdown\.lua:\s*Initialize timer\s+\S+\s+(\d+)/;
const RE_CLOSED     = /ProjectionRewardChoice\.lua:\s*Relic reward screen shut down/;

/* Relikt-Auswahl (ThemedProjectionManager oder Orbiter-Konsole UIConsoleTrigger3):
   Erkennt Veredelung im Schiff sofort beim Interagieren, Rissauswahl in
   der Sternenkarte sowie Reliktwahl zwischen Runden in Endlos-Missionen. */
const RE_SELECT_OPEN   = /ThemedProjectionManager\.lua:\s*PopulateInventoryGrid|Subscribing for \S*ThemedProjectionManager\.swf|UIConsoleTrigger::Open\(\)\s+\S*UIConsoleTrigger3/;
const RE_SELECT_CLOSED = /InitMapping.*filter\s+\/(?:Lotus\/Types\/Player\/(?:TennoShipInputFilter|AvatarInputFilter|PlayerInputFilter)|EE\/Types\/Input\/MapReduxInputFilter|Lotus\/Types\/Input\/LoadoutReduxInputFilter)|Subscribing for \S*ChatRedux\.swf|Background\.lua:\s*(?:Update the Profile Variable|Trying to add calendar challenges)|UIConsoleTrigger::Open\(\)\s+\S*UIConsoleTrigger(?!3)|(?:ThemedMainMenu|RadialSolarMap|PauseMenu|TopMenu)\.lua|(?:TennoShipAvatar|TennoMotion|MotionController|WallSlideController).*Setting PM_|Created\s+\S*(?:Transmission|Dialog|MapRedux|ThemedMainMenu|RadialSolarMap)\.swf|MatchingService::LeaveSquad|Set squad mission/;

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
    this.busy = false;
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
        seconds: 15,
        at: Date.now()
      });
      this.pendingReward = null;
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
      this.emit('relic-select-open', { at: Date.now() });
      return;
    }

    if (this.relicSelectActive && (logSec - this.relicSelectOpenedAt > 0.15 || logSec < this.relicSelectOpenedAt) && RE_SELECT_CLOSED.test(line)) {
      this.relicSelectActive = false;
      this.emit('relic-select-closed', { at: Date.now() });
      return;
    }
  }
}
