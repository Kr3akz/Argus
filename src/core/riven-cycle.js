/**
 * Der Umwandeln-Bildschirm fuer Rivens, aus dem Log gelesen.
 *
 * GEMESSEN am 2026-09-29 an Kaans EE.log - einmal die Nataruk umgewandelt
 * (alten Wurf behalten), danach Torid und Ocucor nur geoeffnet:
 *
 *   15560.102  ResourceLoader 0x… (/Lotus/Weapons/Tenno/Bows/Omicrus/OmicrusPlayerWep) Found 1,185 items to load
 *   15560.103  Created /Lotus/Interface/OmegaRerollSelection.swf
 *   15560.762  OmegaRerollSelection.lua: Diorama setup
 *   15563.844  Dialog::CreateOkCancel(description=Are you sure you want to cycle Nataruk Igni-armanok for 900?, …)
 *   15566.032  Dialog::SendResult(4)
 *   15566.159  Dialog::CreateOkCancel(description=/Lotus/Language/Menu/NavBar_QuickMatchPleaseWait, …)
 *              (zehn Sekunden nichts - die Antwort des Servers steht nicht im Log)
 *   15576.863  Dialog::CreateOkCancel(description=Cycle Riven into current selection?, …)
 *   15577.542  Dialog::SendResult(4)
 *   15577.668  …NavBar_QuickMatchPleaseWait…
 *   15579.425  Flushed 43,280 bytes of recycled effects.
 *
 * WAS DARAUS FOLGT:
 *   - Die Waffe wird eine Millisekunde VOR dem Bildschirm geladen - die
 *     unter "Fits in". Ohne Familie ist ihr Pfad genau das compat des Rivens
 *     (Nataruk: OmicrusPlayerWep, Torid: ClanTech/Bio/BioWeapon). Bei einer
 *     Familie ist es die Variante, die man besitzt (Scourge-Riven: Scourge
 *     Prime) - die Zuordnung dafuer steht in rivens.js,
 *     rivensForShownWeapon. So oder so steht fest, welcher Riven auf dem
 *     Tisch liegt, ohne ein Wort vom Bildschirm zu lesen.
 *   - "Bitte warten" kommt als SPRACHSCHLUESSEL ins Log, nicht als Text - das
 *     eine Zeichen fuer "eine Anfrage ist raus", das in jeder Spielsprache
 *     gleich aussieht. Die erste im Bildschirm ist der Wurf, die zweite die
 *     Wahl, und so fort.
 *   - Die Dialogtexte davor sind uebersetzt. Sie liefern Name und Kuvapreis,
 *     wenn das Spiel englisch laeuft, sind aber nie Voraussetzung.
 *   - Geschlossen wird mit "Flushed … bytes of recycled effects" - bei allen
 *     drei Sitzungen, auch ohne Wurf. Dieselbe Zeile kommt auch im Einsatz,
 *     deshalb zaehlt sie nur, solange ein Bildschirm offen ist.
 */

const RE_WEAPON = /(?:ResourceLoader|Resloader) 0x[0-9A-Fa-f]+ \((\/Lotus\/Weapons\/[^)\s]+)\)/;
const RE_OPEN   = /Created \/Lotus\/Interface\/OmegaRerollSelection\.swf/;
const RE_WAIT   = /Dialog::CreateOkCancel\(description=\/Lotus\/Language\/Menu\/NavBar_QuickMatchPleaseWait/;
const RE_CYCLE  = /Dialog::CreateOkCancel\(description=Are you sure you want to cycle (.+?) for ([\d,.\s]+)\?/;
const RE_CLOSE  = /Flushed [\d,.]+ bytes of recycled effects/;

/* Die Waffe gehoert nur dann zum Bildschirm, wenn sie direkt davor geladen
   wurde - gemessen lag eine Millisekunde dazwischen. Zwei Sekunden lassen
   Luft fuer eine langsame Platte, ohne eine Waffe aus dem Arsenal davor
   mitzunehmen. */
const WEAPON_WINDOW_S = 2;

/* Notbremse, falls die Schlusszeile ausbleibt: niemand sitzt eine
   Viertelstunde ohne jede Regung vor dem Umwandeln-Bildschirm. */
const IDLE_CLOSE_MS = 15 * 60 * 1000;

const logSeconds = line => {
  const m = /^(\d+\.\d+)/.exec(line);
  return m ? parseFloat(m[1]) : null;
};

export class RivenCycleWatch {
  /**
   * @param emit  (typ, daten) => void. Typen: 'open' {weaponPath},
   *              'roll' {name, kuva}, 'choice', 'close' {reason}.
   */
  constructor(emit, { now = () => Date.now() } = {}) {
    this.emit = emit;
    this.now = now;
    this.lastWeapon = null;     // { path, sec }
    this.session = null;        // { weaponPath, waits, name, kuva, lastEventAt }
  }

  handleLine(line) {
    const weapon = RE_WEAPON.exec(line);
    if (weapon) {
      this.lastWeapon = { path: weapon[1], sec: logSeconds(line) };
      return;
    }

    if (RE_OPEN.test(line)) {
      const sec = logSeconds(line);
      const w = this.lastWeapon;
      const fits = w && sec != null && w.sec != null && sec - w.sec >= 0 && sec - w.sec <= WEAPON_WINDOW_S;
      /* Ein zweites Oeffnen ohne Schluss dazwischen: den alten Stand
         abschliessen, sonst haengt ein Overlay vom vorigen Riven weiter. */
      if (this.session) this.close('reopened');
      this.session = { weaponPath: fits ? w.path : null, waits: 0, name: null, kuva: null, lastEventAt: this.now() };
      this.emit('open', { weaponPath: this.session.weaponPath });
      return;
    }

    if (!this.session) return;

    if (this.now() - this.session.lastEventAt > IDLE_CLOSE_MS) {
      this.close('idle');
      return;
    }

    const cycle = RE_CYCLE.exec(line);
    if (cycle) {
      this.session.name = cycle[1].trim();
      this.session.kuva = parseInt(cycle[2].replace(/[^\d]/g, ''), 10) || null;
      this.session.lastEventAt = this.now();
      return;
    }

    if (RE_WAIT.test(line)) {
      this.session.waits++;
      this.session.lastEventAt = this.now();
      if (this.session.waits % 2 === 1) {
        this.emit('roll', { name: this.session.name, kuva: this.session.kuva });
      } else {
        this.emit('choice', {});
      }
      return;
    }

    if (RE_CLOSE.test(line)) this.close('closed');
  }

  close(reason) {
    if (!this.session) return;
    this.session = null;
    this.emit('close', { reason });
  }

  isOpen() {
    return !!this.session;
  }
}
