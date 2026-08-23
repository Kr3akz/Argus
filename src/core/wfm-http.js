/**
 * Gemeinsame Leitung zu warframe.market - Warteschlange, Kopfzeilen, Fehler.
 *
 * WARUM EIN EIGENES MODUL:
 *   Die Drosselung lag frueher privat in market.js. Solange nur Preise
 *   abgerufen wurden, hat das gereicht. Mit Orders, Auktionen und Anmeldung
 *   greifen jetzt vier Module auf denselben Host zu - jedes mit eigener
 *   Warteschlange waere keine Drosselung mehr, sondern vier parallele
 *   Anfragestroeme. warframe.market erlaubt drei Anfragen je Sekunde; das
 *   laesst sich nur einhalten, wenn ALLE Aufrufe durch dieselbe Kette laufen.
 *
 * NICHT ZU VERWECHSELN MIT ratelimit.js:
 *   Das schuetzt DEs IP-Budget, an dem der Spiel-Login haengt. warframe.market
 *   ist ein fremder Host ohne diese Kopplung. Beides in denselben Topf zu
 *   werfen wuerde das knappe DE-Budget fuer Marktabfragen verbrennen.
 *
 * ZWEI API-STAENDE, BEIDE LEBENDIG:
 *   v2  Items, Preise, Orders, Anmeldung. Antwortet { apiVersion, data, error }.
 *   v1  Auktionen (Riven, Kuva-Lich, Sister). Es gibt KEIN v2 dafuer -
 *       /v2/auctions* antwortet durchgaengig 404, nachgemessen am 22.08.2026.
 *       Antwortet { payload } bzw. { error }.
 *   Deshalb nimmt request() den vollen Pfad inklusive Versionsteil.
 */
const HOST = 'https://api.warframe.market';
const USER_AGENT = 'Argus/0.1 (persoenlicher Mastery-Planer)';

/* Drei Anfragen je Sekunde sind erlaubt. 350 ms Abstand liegt darunter und
   laesst Luft fuer alles andere im Prozess. */
const MIN_GAP_MS = 350;

let queueTail = Promise.resolve();
let lastRequestAt = 0;

/**
 * Der Token-Lieferant wird von wfm-auth.js gesetzt.
 *
 * Warum nicht direkt importiert: wfm-auth.js meldet sich ueber genau diese
 * Leitung an. Ein Import in beide Richtungen waere ein Kreis - so kennt die
 * Leitung nur eine Funktion, die ihr jemand reicht.
 */
let tokenProvider = () => null;
export function setTokenProvider(fn) { tokenProvider = typeof fn === 'function' ? fn : () => null; }

/** Alle Abrufe laufen durch dieselbe Kette, damit der Mindestabstand haelt. */
export function queued(task) {
  const run = queueTail.then(async () => {
    const wait = MIN_GAP_MS - (Date.now() - lastRequestAt);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastRequestAt = Date.now();
    return task();
  });
  /* Ein Fehlschlag darf die Kette nicht abreissen lassen. */
  queueTail = run.catch(() => {});
  return run;
}

/** Fehler mit Statuscode und - wo vorhanden - der Feldliste des Servers. */
export class WfmError extends Error {
  constructor(message, { status = 0, fields = null, body = null } = {}) {
    super(message);
    this.name = 'WfmError';
    this.status = status;
    this.fields = fields;
    this.body = body;
  }
}

/**
 * warframe.market meldet Fehler in zwei Formaten, je nach API-Stand:
 *   v2  { error: { inputs: { email: 'app.field.required' } } }
 *       { error: { request: ['app.errors.unauthorized'] } }
 *   v1  { error: { _form: ['app.auctions.errors...'] } }
 *       { error: 'Method not allowed: GET' }
 * Hier wird beides auf denselben Fehler abgebildet, damit die Aufrufer nicht
 * je Endpunkt raten muessen, wo die Begruendung steht.
 */
function describeError(status, body) {
  const err = body?.error;
  if (typeof err === 'string') return { message: err, fields: null };

  if (err && typeof err === 'object') {
    if (err.inputs && typeof err.inputs === 'object') {
      const fields = err.inputs;
      const first = Object.entries(fields)[0];
      return { message: first ? fieldMessage(first[0], first[1]) : 'invalid input', fields };
    }
    const list = err.request || err._form || err.non_field_errors;
    if (Array.isArray(list) && list.length) return { message: humanCode(list[0]), fields: null };

    /* v1 haengt Feldfehler direkt unter error: { weapon_url_name: [...] } */
    const entries = Object.entries(err);
    if (entries.length) {
      const [key, val] = entries[0];
      return { message: fieldMessage(key, Array.isArray(val) ? val[0] : val), fields: err };
    }
  }
  return { message: `HTTP ${status}`, fields: null };
}

/**
 * Feldname davor - aber nur, wenn er etwas hinzufuegt.
 *
 * "platinum: required" braucht das Feld, sonst weiss niemand welches.
 * "email: wrong e-mail or password" dagegen liest sich wie ein Formularfehler
 * an einem Feld, obwohl beide Felder gemeint sind. Ein uebersetzter Code ist
 * bereits ein ganzer Satz und steht allein.
 */
function fieldMessage(field, code) {
  const text = humanCode(code);
  return CODE_TEXT[code] && /\s/.test(text) && !/^(required|too short|invalid)$/.test(text)
    ? text
    : `${field}: ${text}`;
}

/* Die Codes sind Uebersetzungsschluessel der Webseite. Die haeufigsten
   bekommen hier einen Satz, der Rest wird durchgereicht - besser ein roher
   Schluessel als eine erfundene Erklaerung. */
const CODE_TEXT = {
  'app.errors.unauthorized':   'not signed in to warframe.market',
  'app.jwt.unauthorized':      'your warframe.market session is no longer valid',
  'app.field.required':        'required',
  'app.field.tooShort':        'too short',
  'app.field.invalid':         'invalid',
  /* Beide Seiten derselben Frage - warframe.market unterscheidet zwischen
     "Adresse gibt es nicht" und "Passwort falsch". Fuer den Anmeldedialog
     ist das dieselbe Auskunft, und sie einzeln zu melden waere eine
     Einladung, fremde Adressen durchzuprobieren. */
  'app.account.email_not_exist':   'wrong e-mail or password',
  'app.account.password_invalid':  'wrong e-mail or password',
  'app.account.wrongPassword':     'wrong e-mail or password',
  'app.account.notFound':          'wrong e-mail or password',
  /* Der Grund, warum die Anmeldung ueber v1 laeuft: v2 verlangt einen
     Nachweis, den nur die offiziellen Apps von warframe.market erzeugen. */
  'app.auth.appCheckMissing':  'warframe.market rejected this app - sign-in must go through the v1 endpoint',
  'app.order.notFound':        'this order no longer exists',
  'app.item.notFound':         'unknown item'
};
const humanCode = c => CODE_TEXT[c] || String(c ?? '');

/**
 * Eine Anfrage an warframe.market.
 *
 * @param path    voller Pfad ab Host, mit Versionsteil: 'v2/orders/my'
 * @param auth    true = Anmeldung noetig; ohne Token wird gar nicht erst
 *                gesendet, statt eine sichere 401 zu provozieren
 * @param raw     true = ganze Antwort zurueckgeben, sonst nur data/payload
 */
export async function request(path, { method = 'GET', body = null, auth = false, raw = false, headers = {} } = {}) {
  const token = auth ? tokenProvider() : null;
  if (auth && !token) throw new WfmError('not signed in to warframe.market', { status: 401 });

  const res = await queued(() => fetch(`${HOST}/${path}`, {
    method,
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      /* ZWEI FORMATE, WEIL DIE BEIDEN API-STAENDE SICH NICHT EINIG SIND.
         Nachgemessen am 22.08.2026 gegen /v2/orders/my mit einem absichtlich
         ungueltigen Token - der Fehlercode verraet, ob ueberhaupt gelesen
         wurde:
           Authorization: JWT <t>     -> app.errors.unauthorized  (ignoriert)
           Authorization: Bearer <t>  -> app.jwt.unauthorized     (gelesen)
           Cookie: JWT=<t>            -> app.jwt.unauthorized     (gelesen)
         v2 nimmt also nur Bearer oder das Cookie; v1 kam historisch mit
         "JWT <t>". Das Cookie ist der gemeinsame Nenner - es geht mit,
         zusammen mit Bearer fuer v2. Nur "JWT <t>" zu senden hiesse, dass
         jeder v2-Aufruf trotz gueltiger Anmeldung auf 401 laeuft. */
      ...(token ? { Authorization: `Bearer ${token}`, Cookie: `JWT=${token}` } : {}),
      ...headers
    },
    body: body ? JSON.stringify(body) : undefined
  }));

  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* HTML-Fehlerseite */ }

  if (!res.ok) {
    const { message, fields } = describeError(res.status, json);
    throw new WfmError(message, { status: res.status, fields, body: json });
  }

  if (raw) return { json, res };
  /* v2 liefert data, v1 liefert payload. */
  return json?.data !== undefined ? json.data : (json?.payload !== undefined ? json.payload : json);
}
