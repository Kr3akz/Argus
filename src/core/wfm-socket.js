/**
 * Anwesenheit auf warframe.market: "ingame", solange Warframe laeuft.
 *
 * WARUM UEBERHAUPT EIN WEBSOCKET:
 *   Der Status ist in der v2-API keine Ressource, die man setzt und die dann
 *   liegen bleibt - er haengt an einer offenen Verbindung. Die Doku sagt es
 *   ausdruecklich: ohne `duration` gilt der Status genau so lange, wie die
 *   Verbindung steht. Es gibt also keinen HTTP-Aufruf, den wir stattdessen
 *   machen koennten.
 *
 * UND GENAU DAS IST HIER DER ENTWURF, NICHT SEIN PREIS:
 *   Argus soll den Status nicht verwalten, sondern nur ergaenzen. Wer auf der
 *   Webseite "online" steht, soll das bleiben; wer sich unsichtbar gemacht
 *   hat, soll unsichtbar bleiben. Deshalb senden wir NIE "online" und NIE
 *   "invisible" - die beiden anderen Werte, die das Protokoll kennt, kommen
 *   in dieser Datei nicht vor. Wir legen "ingame" oben drauf, solange das
 *   Spiel laeuft, und nehmen es zurueck, indem wir die Verbindung schliessen.
 *   Was dann gilt, entscheidet warframe.market - nicht wir.
 *
 *   Die Verbindung lebt deshalb exakt so lange wie das Spiel. Kein Spiel,
 *   kein Socket, keine Aussage.
 *
 * ANMELDUNG NACH DEM VERBINDEN, NICHT DAVOR:
 *   Der Token geht als Nachricht (@wfm|cmd/auth/signIn), nicht als Kopfzeile.
 *   Das ist der Grund, warum hier kein Sonderweg fuer Header noetig ist - und
 *   warum das Token diese Datei nie in einer Log-Zeile verlaesst.
 *
 * Gemessen an docs.warframe.market/docs/websockets (Stand 29.08.2026):
 *   Endpunkt      wss://ws.warframe.market/socket, Subprotokoll "wfm"
 *   Anmelden      {"route":"@wfm|cmd/auth/signIn","id":..,"payload":{"token":..}}
 *   Status        {"route":"@wfm|cmd/status/set","id":..,"payload":{"status":"ingame"}}
 *   Fehler        @wfm|protect/error, z. B. "app.errors.userNotVerified"
 */
import { EventEmitter } from 'node:events';
import { WebSocket } from 'ws';

const ENDPOINT    = 'wss://ws.warframe.market/socket';
const SUBPROTOCOL = 'wfm';
const USER_AGENT  = 'Argus/1.0 (personal mastery planner)';

/* Wartezeiten nach einem Abriss. Bewusst schnell steigend und bei zwei
   Minuten gedeckelt: eine gescheiterte Verbindung ist kein Notfall, und ein
   Programm, das im Sekundentakt gegen einen fremden Server laeuft, ist eins.
   Die Reihe endet nicht - der letzte Wert gilt weiter. */
const RETRY_MS = [5000, 15000, 45000, 120000];

/* Eigener Ping, damit die Leitung nicht still einschlaeft. Ein stiller
   Abriss waere hier besonders unangenehm: der Status faellt weg, ohne dass
   jemand es merkt, und die Oberflaeche zeigt weiter "ingame". */
const PING_MS = 45000;

/* Fehler, die sich durch Warten NICHT beheben. Wer nicht angemeldet oder
   nicht verifiziert ist, ist es auch in zwei Minuten noch nicht - hier
   aufzuhoeren ist der Unterschied zwischen einer Fehlermeldung und einem
   Programm, das stundenlang gegen eine verschlossene Tuer klopft. */
const FINAL_ERRORS = new Set([
  'app.errors.unauthorized',
  'app.jwt.unauthorized',
  'app.errors.userNotVerified',
  'app.errors.userBanned'
]);

const MESSAGES = {
  'app.errors.unauthorized':    'warframe.market did not accept the session',
  'app.jwt.unauthorized':       'your warframe.market session is no longer valid',
  'app.errors.userNotVerified': 'warframe.market requires a verified account for this',
  'app.errors.userBanned':      'this warframe.market account is banned'
};

/**
 * Haelt "ingame" aufrecht, solange beides gilt: der Schalter ist an UND das
 * Spiel laeuft. Alles andere fuehrt zum Schliessen der Verbindung.
 *
 * Ereignis 'state' mit { state, error }:
 *   'off'         nichts offen - Schalter aus oder Spiel zu
 *   'connecting'  Verbindung oder Anmeldung laeuft
 *   'ingame'      der Status steht
 *   'error'       endgueltig gescheitert, siehe error
 */
export class MarketPresence extends EventEmitter {
  #tokenProvider;
  #enabled = false;
  #gameRunning = false;
  #ws = null;
  #state = 'off';
  #error = null;
  #retry = 0;
  #retryTimer = null;
  #pingTimer = null;
  #nextId = 1;

  /** @param tokenProvider async () => string|null - liefert das JWT */
  constructor(tokenProvider) {
    super();
    this.#tokenProvider = tokenProvider;
  }

  get state() { return { state: this.#state, error: this.#error }; }

  /** Der Schalter in der Oberflaeche. */
  setEnabled(on) {
    if (this.#enabled === !!on) return;
    this.#enabled = !!on;

    /* JEDE bewusste Bedienung raeumt einen frueheren Endfehler weg, und zwar
       in BEIDE Richtungen:
         einschalten  sonst bliebe jemand nach einer abgelaufenen Sitzung fuer
                      immer im Fehlerzustand, obwohl er sich laengst neu
                      angemeldet hat - #want() laesst bei 'error' nichts mehr zu.
         ausschalten  ein roter Punkt an einem ausgeschalteten Schalter behauptet
                      einen Schaden, den es nicht gibt. Wer abschaltet, hat das
                      Problem erledigt, nicht geerbt.
       Nur das Spiel selbst raeumt nicht auf: geht Warframe zu und wieder auf,
       bleibt ein echter Fehler stehen, statt bei jedem Start neu gegen
       dieselbe verschlossene Tuer zu laufen. */
    this.#retry = 0;
    if (this.#state === 'error') this.#setState('off');
    this.#sync();
  }

  /** Der Waechter meldet, ob Warframe laeuft. */
  setGameRunning(running) {
    if (this.#gameRunning === !!running) return;
    this.#gameRunning = !!running;
    this.#sync();
  }

  /**
   * Beim Beenden von Argus. Schliesst die Verbindung und damit den Status.
   *
   * Bewusst NICHT ueber #sync(): Beenden ist kein Zustandsuebergang, den man
   * noch abwaegt. Alles aus, Leitung zu, kein Fehler mehr uebrig, den beim
   * naechsten Start jemand erben koennte.
   */
  shutdown() {
    this.#enabled = false;
    this.#gameRunning = false;
    this.#retry = 0;
    this.#teardown();
    this.#setState('off');
  }

  /* ------------------------- Innenleben ------------------------- */

  #want() {
    return this.#enabled && this.#gameRunning && this.#state !== 'error';
  }

  #sync() {
    if (this.#want()) {
      if (!this.#ws && !this.#retryTimer) this.#connect();
    } else {
      this.#teardown();
      if (this.#state !== 'error') this.#setState('off');
    }
  }

  #setState(state, error = null) {
    if (this.#state === state && this.#error === error) return;
    this.#state = state;
    this.#error = error;
    this.emit('state', this.state);
  }

  #send(route, payload) {
    if (this.#ws?.readyState !== WebSocket.OPEN) return;
    this.#ws.send(JSON.stringify({ route, id: `argus-${this.#nextId++}`, payload }));
  }

  #teardown() {
    clearTimeout(this.#retryTimer); this.#retryTimer = null;
    clearInterval(this.#pingTimer); this.#pingTimer = null;
    const ws = this.#ws;
    this.#ws = null;
    if (!ws) return;
    /* removeAllListeners zuerst: sonst laeuft beim eigenen Schliessen noch
       der close-Handler und plant einen Neuversuch, den niemand wollte. */
    ws.removeAllListeners();
    try { ws.close(1000, 'argus'); } catch { /* schon tot */ }
  }

  #scheduleRetry() {
    if (!this.#want()) return;
    const wait = RETRY_MS[Math.min(this.#retry, RETRY_MS.length - 1)];
    this.#retry++;
    this.#retryTimer = setTimeout(() => {
      this.#retryTimer = null;
      if (this.#want()) this.#connect();
    }, wait);
  }

  async #connect() {
    const token = await this.#tokenProvider().catch(() => null);
    if (!token) {
      this.#setState('error', 'not signed in to warframe.market');
      return;
    }
    /* Zwischen dem await oben und hier kann das Spiel zugegangen sein. */
    if (!this.#want()) return;

    this.#setState('connecting');

    let ws;
    try {
      ws = new WebSocket(ENDPOINT, SUBPROTOCOL, { headers: { 'User-Agent': USER_AGENT } });
    } catch (err) {
      this.#setState('connecting', null);
      this.#scheduleRetry();
      return;
    }
    this.#ws = ws;

    ws.on('open', () => {
      this.#send('@wfm|cmd/auth/signIn', { token });
      this.#pingTimer = setInterval(() => {
        try { ws.ping(); } catch { /* der close-Handler raeumt auf */ }
      }, PING_MS);
    });

    ws.on('message', raw => this.#onMessage(raw));

    /* Ein Fehler auf der Leitung ist noch kein Endfehler - der close-Handler
       darunter entscheidet, ob neu versucht wird. Ohne diesen Zuhoerer wirft
       ws den Fehler als unbehandeltes Ereignis in den Prozess. */
    ws.on('error', () => {});

    ws.on('close', () => {
      if (this.#ws !== ws) return;          // schon abgeloest
      clearInterval(this.#pingTimer); this.#pingTimer = null;
      this.#ws = null;
      if (!this.#want()) { this.#setState('off'); return; }
      this.#setState('connecting');
      this.#scheduleRetry();
    });
  }

  #onMessage(raw) {
    let msg;
    try { msg = JSON.parse(String(raw)); } catch { return; }
    const route = msg?.route;

    if (route === '@wfm|cmd/auth/signIn:ok') {
      /* Nur "status" im Rumpf: ohne duration gilt er, solange die Verbindung
         steht - und das ist genau die Zusage, die wir halten wollen. Ein
         activity-Feld gaebe es auch; es bliebe eine Behauptung darueber, WAS
         jemand gerade spielt, und die koennen wir nicht belegen. */
      this.#send('@wfm|cmd/status/set', { status: 'ingame' });
      return;
    }

    if (route === '@wfm|cmd/status/set:ok') {
      this.#retry = 0;
      this.#setState('ingame');
      return;
    }

    if (typeof route === 'string' && (route.endsWith(':error') || route === '@wfm|protect/error')) {
      const code = typeof msg.payload === 'string' ? msg.payload : msg.payload?.code;
      if (FINAL_ERRORS.has(code)) {
        this.#setState('error', MESSAGES[code] || String(code));
        this.#teardown();
        return;
      }
      /* Unbekannter Fehler: die Leitung schliessen und es spaeter nochmal
         versuchen. Ein roher Schluessel ist als Meldung besser als eine
         erfundene Erklaerung - dieselbe Regel wie in wfm-http.js. */
      this.#setState('connecting', null);
      const ws = this.#ws;
      this.#ws = null;
      try { ws?.removeAllListeners(); ws?.close(); } catch { /* egal */ }
      clearInterval(this.#pingTimer); this.#pingTimer = null;
      this.#scheduleRetry();
    }
  }
}
