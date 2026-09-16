/**
 * Das Protokoll der Speichersuchen - und warum es das ueberhaupt gibt.
 *
 * DER ANLASS:
 *   Der Inventar-Scan lief hier und scheiterte bei anderen. Acht Dinge koennen
 *   schiefgehen - der Schalter steht aus, das Spiel laeuft als Administrator,
 *   der Prozess heisst anders, die Kopie liegt in einer zu grossen Region, das
 *   Zeitlimit reisst, im Heap liegt gerade gar nichts. Die Oberflaeche machte
 *   aus allen acht denselben Satz ("Cannot fetch right now"), und `stats` - die
 *   Zahlen, die die Frage beantworten - warf sie weg, bevor sie irgendwer sah.
 *
 *   Aus der Ferne war damit nichts zu klaeren. Man konnte raten und zurueckfragen
 *   und wieder raten. Ein Bildschirmfoto beendet das in zwei Sekunden.
 *
 * WAS HIER STEHT UND WAS NICHT:
 *   Regionszahlen, Megabyte, Sekunden, Fundadressen, Feldabdeckung, Zeitstempel.
 *   Also: wie die Suche verlief. NICHT: was gefunden wurde. Kein Inventarinhalt,
 *   keine Account-ID, kein Spielername, keine Clan-Zugehoerigkeit - der Bericht
 *   ist zum Herumzeigen gedacht, und was man herumzeigt, darf nichts enthalten,
 *   das einem gehoert. Die Adressen sind Speicherlagen eines Prozesses, der beim
 *   naechsten Start woanders liegt; sie sagen ueber das Konto nichts aus.
 *
 * NUR IM ARBEITSSPEICHER:
 *   Bewusst keine Datei. Das Protokoll wird gebraucht, solange das Fenster offen
 *   ist - "es hat gerade nicht geklappt, zeig mal her". Eine Datei auf Platte
 *   waere ein zweiter Ort, an dem etwas liegt, das aufgeraeumt werden muss, und
 *   sie ueberlebte genau den Fall nicht, fuer den sie da waere: dass jemand die
 *   Anwendung aus Aerger schliesst.
 */

/* Wie viele Laeufe aufgehoben werden. Zwanzig deckt eine Sitzung mit
   Auto-Sync bequem ab und kostet auch bei voller Liste nur ein paar Kilobyte -
   die grossen Felder (Text der Scheiben, das geparste Inventar) kommen hier
   ohnehin nie an. */
const KEEP = 20;

const runs = [];

/**
 * Einen Lauf vermerken. Wird von loadInventory() aufgerufen - der einen Stelle,
 * durch die jeder Scan geht, ob er gelingt oder nicht.
 *
 * DARF NIE WERFEN. Ein kaputtes Protokoll waere ein laecherlicher Grund, einen
 * gelungenen Abruf scheitern zu lassen; deshalb steht der ganze Rumpf in try.
 */
export function recordScan({ trigger = 'manual', result = {}, pids = [] } = {}) {
  try {
    const stats = result.stats || {};
    runs.unshift({
      at: Date.now(),
      trigger,
      ok: result.ok === true,
      code: result.code || null,
      message: result.message || null,
      seconds: stats.seconds ?? null,
      pids: [...pids],
      passes: (stats.passes || []).map(p => ({ ...p })),
      /* Wie viele Pflichtfelder es zum Zeitpunkt des Laufs GAB. Die Zahl stand
         frueher fest im Bericht und war nach der ersten Kuerzung der Liste
         falsch - ein Protokoll, das luegt, ist schlimmer als keines. */
      requiredFields: stats.requiredFields || null,
      candidates: (stats.candidates || []).map(c => ({ ...c })),
      chosen: stats.chosen ? { ...stats.chosen } : null,
      note: stats.note || null,
      repaired: stats.repaired ?? null,
      attempts: (stats.attempts || []).map(a => ({ ...a }))
    });
    if (runs.length > KEEP) runs.length = KEEP;
  } catch { /* ein Protokoll darf nichts kaputtmachen */ }
}

/** Alles vergessen. Fuer den Knopf neben dem Bericht. */
export function clearScans() {
  runs.length = 0;
}

/** Wie viele Laeufe liegen vor, und ist der letzte gescheitert? */
export function scanSummary() {
  if (!runs.length) return { count: 0, lastOk: null, lastAt: null, lastCode: null };
  return { count: runs.length, lastOk: runs[0].ok, lastAt: runs[0].at, lastCode: runs[0].code };
}

const TRIGGERS = {
  manual:  'Fetch inventory (button)',
  autosync:'Auto-sync',
  weekly:  'Weekly view',
  setup:   'First fetch after setup'
};

const uhr = ms => new Date(ms).toLocaleTimeString('en-GB', { hour12: false });

/* Wie breit eine Zeile werden darf, bevor sie umbricht.
   Gemessen im Protokollfenster: bei 11,5px in fester Schrift passen rund 115
   Zeichen in die 808px Innenbreite. 100 laesst also Luft - und Luft ist hier
   richtig, weil das Fenster auf einem fremden Bildschirm steht. */
const BREITE = 100;

/**
 * Lange Fliesstexte auf mehrere Zeilen verteilen, jede Folgezeile eingerueckt.
 *
 * WARUM UEBERHAUPT: das Protokoll steht in <pre> ohne Textumbruch - die
 * Tabellenspalten haengen daran. Eine lange Fehlermeldung ("missing 13:
 * Suits, LongGuns, ...") schiebt die Zeile dann ueber den Rand hinaus, und
 * beim Abfotografieren fehlt genau das Ende, auf das es ankommt. Also hier
 * umbrechen statt den Leser waagerecht rollen lassen.
 *
 * Bricht NUR an Leerzeichen. Ein einzelnes ueberlanges Wort bleibt lieber zu
 * lang, als dass es mitten in einem Feldnamen zerrissen wird.
 */
function umbrich(text, einzug) {
  const zeilen = [];
  let zeile = '';
  for (const wort of String(text).split(/\s+/).filter(Boolean)) {
    const kandidat = zeile ? `${zeile} ${wort}` : wort;
    if (einzug.length + kandidat.length > BREITE && zeile) {
      zeilen.push(einzug + zeile);
      zeile = wort;
    } else {
      zeile = kandidat;
    }
  }
  if (zeile) zeilen.push(einzug + zeile);
  return zeilen;
}

/** hh:mm:ss aus einem ObjectId-Stempel, oder ein Strich. */
const stand = ms => (ms ? new Date(ms).toLocaleString('en-GB', { hour12: false }) : '—');

/**
 * Der Bericht als einfacher Text.
 *
 * FUER EIN BILDSCHIRMFOTO GEBAUT, nicht fuer eine Maschine: feste Spalten,
 * keine Klammern, keine Verschachtelung. Wer ihn abtippen muesste, koennte es.
 *
 * `context` liefert der Hauptprozess - Fassung, System, Schalterstellung,
 * Spielprozess. Es steht OBEN und nicht unten: die Haelfte aller Faelle
 * ("Schalter aus", "Spiel laeuft nicht", "andere Fassung") ist damit schon in
 * der Kopfzeile beantwortet, ohne dass man die Laufliste ueberhaupt liest.
 */
export function formatReport(context = {}) {
  const L = [];
  const {
    version, build, buildDate, platform, arch, electron, node,
    inventoryScan, inventoryAutoSync, gamePids = [], gameFound
  } = context;

  L.push(`Argus ${version || '?'}${build ? `  ·  build ${build}` : '  ·  development build'}`
       + (buildDate ? `  (${buildDate})` : ''));
  L.push(`${platform || '?'} ${arch || ''}  ·  Electron ${electron || '?'}  ·  Node ${node || '?'}`);
  L.push(`Inventory access: ${inventoryScan ? 'ON' : 'OFF'}`
       + `  ·  Auto-sync: ${inventoryAutoSync ? 'ON' : 'OFF'}`);
  L.push(`Warframe.x64.exe: ${gameFound
    ? `running (PID ${gamePids.join(', ')})`
    : 'not running'}`);

  /* Die Schalterstellung ist der haeufigste Fall und der einzige, der ohne
     jeden Scan feststeht - sie gehoert deshalb nicht in eine Fussnote. */
  if (!inventoryScan) {
    L.push('');
    L.push('>> Inventory access is switched off. Nothing will be read until the');
    L.push('   toggle above this button is on.');
  }

  L.push('');
  L.push('--- scans this session ' + '-'.repeat(46));

  if (!runs.length) {
    L.push('');
    L.push('  Nothing yet. Press "Fetch inventory" once, then open this again.');
    return L.join('\n');
  }

  for (const r of runs) {
    L.push('');
    L.push(`[${uhr(r.at)}]  ${TRIGGERS[r.trigger] || r.trigger}  —  `
         + (r.ok ? `OK in ${r.seconds ?? '?'}s` : `FAILED: ${r.code || 'unknown'}`));

    if (!r.ok && r.message) L.push(...umbrich(r.message, '   '));

    for (const p of r.passes) {
      L.push(`   ${String(p.pass).padEnd(24)}`
           + `${String(p.regions).padStart(6)} reg  `
           + `${String(p.megabytes).padStart(5)} MB  `
           + `${String(p.anchors).padStart(3)} anchors  `
           + `${String(p.spans).padStart(3)} spans  `
           + `${String(p.seconds).padStart(6)}s`
           /* Doppelte Anker sind der Normalfall, seit es zwei davon gibt -
              ohne diese Zahl saehe "8 anchors, 4 spans" nach Verlust aus.
              Kurz gehalten, damit die Zeile unter BREITE bleibt. */
           + (p.dupes ? `  +${p.dupes} dup` : '')
           + (p.timedOut ? '  TIME LIMIT HIT' : ''));
    }

    if (!r.passes.length && !r.ok) {
      L.push('   (no memory was read — the run stopped before the search)');
    }

    /* Die Kandidatenliste ist der Kern: an ihr sieht man, ob gar nichts im
       Heap lag, ob nur Reste dalagen oder ob eine heile Kopie da war und an
       etwas anderem gescheitert ist. */
    if (r.candidates.length) {
      const wahl = r.chosen?.address;
      /* Was aus jedem Kandidaten geworden ist, steht in attempts - hier
         zusammengefuehrt, damit eine Zeile je Fundstelle reicht. */
      const ergebnis = new Map(r.attempts.map(a => [a.address, a.result]));

      /* NUR DIE VORDERSTEN, und das ist kein Geiz.
         Seit es zwei Anker gibt, kommen auch die vielen kleinen Bruchstuecke
         mit - gemessen 42 Fundstellen in einem Lauf. Je zwei Zeilen macht das
         einen Bericht ueber mehrere Bildschirmseiten, und genau das war er
         nicht: er soll auf EIN Bildschirmfoto passen.
         Die Liste ist nach Feldabdeckung sortiert, die vordersten sind also
         die aussagekraeftigsten - und die gewaehlte steht ohnehin unter den
         ersten, weil sie die erste ist, die alle Proben bestanden hat. */
      const ZEIGE = 8;
      const liste = r.candidates.slice(0, ZEIGE);
      const rest = r.candidates.length - liste.length;
      /* Aeltere Laeufe im Puffer kennen die Zahl noch nicht - dann lieber
         nichts behaupten als die alte 17 hinschreiben. */
      const soll = r.requiredFields ? '/' + r.requiredFields : '';
      for (const c of liste) {
        const mark = c.address === wahl ? '>' : ' ';
        const zeile = `  ${mark}${c.address.padEnd(15)}`
                    + `${String(c.kilobytes).padStart(6)} KB  `
                    + `${String(c.fields).padStart(2)}${soll} fields  `
                    /* WELCHER Anker gegriffen hat. Auf einem Konto ohne
                       Helminth war genau das die Frage, die niemand
                       beantworten konnte. */
                    + (c.anchor ? `via ${c.anchor.replace(/"/g, '').padEnd(14)}` : '')
                    + `synced ${stand(c.syncedAt)}`;

        /* Das Ergebnis bleibt in derselben Zeile, SOLANGE ES PASST - eine
           Zeile je Fundstelle liest sich besser. Passt es nicht, rutscht es
           darunter statt die Tabellenspalten zu sprengen; dort steht oft die
           eigentliche Auskunft ("missing 4: Suits, LongGuns, ..."). */
        const res = ergebnis.get(c.address);
        if (!res) { L.push(zeile); continue; }
        if (zeile.length + 4 + res.length <= BREITE) L.push(`${zeile}  -> ${res}`);
        else { L.push(zeile); L.push(...umbrich('-> ' + res, '       ')); }
      }
      /* Der Rest wird nicht verschwiegen, nur nicht aufgezaehlt - sonst sieht
         eine gekuerzte Liste aus wie eine vollstaendige. */
      if (rest) {
        const kleinste = r.candidates[r.candidates.length - 1];
        L.push(`   … ${rest} more fragment(s), down to ${kleinste.kilobytes} KB `
             + `and ${kleinste.fields}${soll} fields`);
      }
    } else if (r.passes.length) {
      L.push('   no copy of the inventory found in memory');
    }

    if (r.ok && r.chosen) {
      /* Die Reparaturnotiz nennt Tiefe, Feldzahl und abgeschnittene Bytes und
         wird damit laenger als die Zeile - umbrechen statt abschneiden, sonst
         fehlt auf dem Bildschirmfoto genau der Teil, der etwas erklaert. */
      L.push(...umbrich(`document ${r.chosen.kilobytes} KB, `
           + (r.chosen.startsWithBrace ? 'complete from the start' : 'cut at the front')
           + (r.repaired ? `, repaired: ${r.note}` : ''), '   '));
    }
  }

  return L.join('\n');
}
