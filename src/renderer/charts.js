/**
 * Die Diagramme des Handelstabs - Zeitreihe, Summenlinie, Rangliste.
 *
 * WARUM SELBST GEZEICHNET UND KEINE BIBLIOTHEK:
 *   Die Content-Security-Policy von index.html laesst nur eigene Dateien zu
 *   (`default-src 'self'`). Eine Bibliothek von einem CDN laedt hier gar
 *   nicht, und eine mitgelieferte waere fuer drei Diagramme ein halbes
 *   Megabyte Fremdcode mit eigenem Farbschema, das anschliessend gegen das
 *   Stilblatt der Anwendung gebogen werden muesste. Drei Diagramme sind
 *   ueberschaubar: ein paar rect, ein path, ein paar Beschriftungen.
 *
 * SVG UND NICHT CANVAS: Ein Canvas muesste bei jeder Fenstergroesse neu
 * gezeichnet werden und kennt kein `currentColor`. Das SVG hier skaliert von
 * selbst mit und nimmt seine Farben aus denselben CSS-Variablen wie alles
 * andere - ein Themenwechsel faerbt die Diagramme mit, ohne dass hier eine
 * Zeile davon weiss.
 *
 * EIGENE DATEI, GLOBALES `Charts`: wie icons.js und stock.js. app.js ist
 * bereits ueber zehntausend Zeilen lang; das Zeichenhandwerk hat damit
 * nichts zu tun und steht deshalb daneben.
 */
const Charts = (() => {

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* Zwei Nachkommastellen reichen dem Zeichner und halten das Markup lesbar. */
  const n2 = v => Math.round(v * 100) / 100;

  /* ---------------------------- Zeitraster ---------------------------- */

  const TAG = 86400000;

  /** Anfang des Tages in Ortszeit - nicht UTC: der Handel fand hier statt. */
  function dayStart(ts) {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  /** Anfang der Woche, Montag. */
  function weekStart(ts) {
    const d = new Date(dayStart(ts));
    /* getDay(): 0 = Sonntag. Der Sonntag gehoert zur Woche davor, deshalb 6
       Tage zurueck statt minus null. */
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d.getTime();
  }

  function monthStart(ts) {
    const d = new Date(ts);
    return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  }

  const STEP = {
    /* NICHT t + 24 h: an den beiden Tagen, an denen die Uhr umgestellt wird,
       hat ein Tag 23 bzw. 25 Stunden. Der naechste Kasten laege dann bei
       23:00 statt Mitternacht, waehrend die Eintraege ueber dayStart auf
       Mitternacht gerundet werden - sie faenden ihren Kasten nicht mehr und
       fielen aus dem Diagramm. 36 Stunden landen in jedem Fall mitten im
       Folgetag, und dayStart schneidet zurueck. */
    day:   { start: dayStart,   next: t => dayStart(t + 36 * 3600000),
             label: t => new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) },
    week:  { start: weekStart,  next: t => weekStart(t + 8 * TAG),
             label: t => new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) },
    month: { start: monthStart, next: t => monthStart(new Date(t).setMonth(new Date(t).getMonth() + 1)),
             label: t => new Date(t).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }) }
  };

  /**
   * Welche Koerngroesse zu welchem Zeitraum passt.
   *
   * Die Grenze ist die LESBARKEIT DER ACHSE, nicht die Genauigkeit: 365
   * Tagesbalken auf 700 px sind ein Strichmuster, kein Diagramm. Gewaehlt
   * wird so, dass hoechstens rund 45 Balken herauskommen.
   */
  function pickBucket(days) {
    if (!days || days > 400) return 'month';
    if (days <= 45) return 'day';
    if (days <= 220) return 'week';
    return 'month';
  }

  /* ---------------------------- Aggregation ---------------------------- */

  /**
   * Aus einer Liste Handelszeilen die Reihe, die das Diagramm zeichnet.
   *
   * LUECKEN WERDEN AUFGEFUELLT. Wer drei Tage nicht gehandelt hat, hat drei
   * Tage mit null - stuenden nur die Tage mit Umsatz da, saehe eine Pause
   * aus wie ein dichter Handelstag neben dem naechsten, und die Summenlinie
   * verliefe schraeg durch Zeit, die es nicht gab.
   *
   * ZEILEN OHNE DATUM BLEIBEN DRAUSSEN. warframe.market liefert zu manchen
   * abgeschlossenen Orders keinen Zeitstempel (siehe dateUnknown in
   * wfm-orders.js). Sie irgendwo einzusortieren hiesse, einen Tag zu
   * erfinden; sie werden gezaehlt und die Oberflaeche sagt es dazu.
   *
   * @param entries  Zeilen EINER Waehrung, ungefiltert nach Zeit
   * @param days     Fenster in Tagen; null = alles seit der ersten Zeile
   */
  function series(entries, { days = 30, bucket = 'auto' } = {}) {
    const dated = (entries || []).filter(e => e.at > 0 && !e.dateUnknown);
    const undated = (entries || []).length - dated.length;

    const now = Date.now();
    const oldest = dated.length ? Math.min(...dated.map(e => e.at)) : now;
    const from = days ? Math.max(now - days * TAG, 0) : oldest;

    const span = Math.max(1, Math.ceil((now - from) / TAG));
    const grain = bucket === 'auto' ? pickBucket(days || span) : bucket;
    const step = STEP[grain] || STEP.day;

    const rows = dated.filter(e => e.at >= from);

    /* Erst die Kaesten anlegen, dann fuellen - so stehen auch die leeren da. */
    const buckets = [];
    const byStart = new Map();
    for (let t = step.start(from); t <= now; t = step.next(t)) {
      const b = { start: t, label: step.label(t), earned: 0, spent: 0, net: 0, trades: 0 };
      buckets.push(b);
      byStart.set(t, b);
    }

    for (const e of rows) {
      const b = byStart.get(step.start(e.at));
      if (!b) continue;
      if (e.direction === 'sold') b.earned += e.total; else b.spent += e.total;
      b.trades += 1;
    }

    let laufend = 0;
    for (const b of buckets) {
      b.net = b.earned - b.spent;
      laufend += b.net;
      b.cumulative = laufend;
    }

    return { buckets, grain, from, to: now, rows, undated };
  }

  /**
   * Womit verdient man eigentlich - je Item zusammengefasst.
   *
   * Einnahmen UND Ausgaben in einer Zeile: bei einem Teil, das man kauft und
   * teurer verkauft, ist genau die Differenz die Auskunft. Sortiert wird nach
   * dem, wonach gefragt wird (Einnahmen), nicht nach der Differenz - sonst
   * verschwindet der groesste Umsatz hinter einem Zufallsgewinn.
   */
  function byItem(entries, { limit = 8 } = {}) {
    const map = new Map();
    for (const e of entries || []) {
      const key = e.slug || e.name;
      const row = map.get(key) || {
        key, name: e.name, image: e.image || null,
        earned: 0, spent: 0, quantity: 0, trades: 0
      };
      if (e.direction === 'sold') { row.earned += e.total; row.quantity += e.quantity; }
      else                        { row.spent  += e.total; }
      row.trades += 1;
      if (!row.image && e.image) row.image = e.image;
      map.set(key, row);
    }
    return [...map.values()]
      .map(r => ({ ...r, net: r.earned - r.spent }))
      .sort((a, b) => (b.earned - a.earned) || (b.spent - a.spent))
      .slice(0, limit);
  }

  /**
   * Was der Kontostand in einem Zeitraum gemacht hat.
   *
   * DER STAND DAVOR GEHOERT DAZU. Wer die letzten 30 Tage ansieht, will
   * wissen, wie viel sich in 30 Tagen bewegt hat - und dafuer braucht es den
   * Stand, mit dem der Zeitraum BEGANN. Der liegt in aller Regel davor:
   * gemessen wird, wenn das Spiel synchronisiert, nicht am Monatsersten. Ohne
   * ihn finge die Rechnung beim ersten Messpunkt INNERHALB des Fensters an
   * und unterschluege alles, was bis dahin schon passiert war.
   *
   * Gibt es keinen Stand davor, faengt die Rechnung beim ersten Messpunkt im
   * Fenster an - dann deckt sie weniger Zeit ab als der gewaehlte Zeitraum,
   * und `first.at` sagt, ab wann sie gilt. Die Oberflaeche nennt das Datum,
   * statt eine Differenz ueber dreissig Tage zu behaupten, die drei meint.
   *
   * @param currency 'platinum' | 'ducats'
   * @param from     Beginn des Fensters, null = alles
   */
  function walletWindow(entries, { currency = 'platinum', from = null } = {}) {
    const rows = (entries || [])
      .filter(e => e && Number.isFinite(e.at) && e[currency] != null)
      .sort((a, b) => a.at - b.at)
      .map(e => ({ at: e.at, value: e[currency] }));

    const leer = { points: [], first: null, last: null, delta: null, readings: 0 };
    if (!rows.length) return leer;

    const inWindow = from ? rows.filter(e => e.at >= from) : rows;
    const anchor = from ? [...rows].reverse().find(e => e.at < from) || null : null;

    const points = anchor ? [anchor, ...inWindow] : inWindow;
    if (!points.length) return leer;

    const first = points[0];
    const last = points[points.length - 1];
    return {
      points, first, last,
      /* Eine Differenz braucht zwei Messungen. Bei einer einzigen steht der
         Stand fest, seine Bewegung nicht - und null waere die Behauptung,
         es habe sich nichts getan. */
      delta: points.length > 1 ? last.value - first.value : null,
      readings: points.length
    };
  }

  /* ----------------------------- Zeichnen ----------------------------- */

  /**
   * Das Koordinatensystem.
   *
   * EINE SVG-EINHEIT IST EIN BILDPUNKT, und deshalb bekommt barsWithLine die
   * gemessene Breite des Kastens mit. Der bequeme Weg waere eine feste
   * viewBox mit preserveAspectRatio="none" - dann skaliert der Browser von
   * selbst, UND ER SKALIERT DIE SCHRIFT MIT: auf einem breiten Fenster steht
   * die Achsenbeschriftung um zwei Drittel in die Laenge gezogen da. Deshalb
   * lieber einmal messen und beim Groessenwechsel neu zeichnen.
   */
  const H = 240;
  /* Rechts genauso viel Platz wie links: dort steht die Skala der laufenden
     Summe. Ohne sie haengt die Linie im Bild, ohne dass jemand sagen koennte,
     welche Zahl ihr Hoehepunkt bedeutet - und der Betrachter liest sie an der
     linken Achse ab, wo sie nicht hingehoert. */
  const PAD = { top: 14, right: 48, bottom: 26, left: 46 };

  /**
   * Eine runde Zahl oberhalb des Hoechstwerts - damit die Achse bei 400 endet
   * und nicht bei 387. Ohne das haette jeder Zeitraum eine andere krumme
   * Obergrenze, und zwei Diagramme nebeneinander waeren nicht vergleichbar.
   */
  function niceMax(value) {
    if (!(value > 0)) return 10;
    const mag = Math.pow(10, Math.floor(Math.log10(value)));
    for (const f of [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10]) {
      if (value <= mag * f) return mag * f;
    }
    return mag * 10;
  }

  const short = v => {
    const a = Math.abs(v);
    if (a >= 1000000) return (v / 1000000).toFixed(a >= 10000000 ? 0 : 1).replace(/\.0$/, '') + 'M';
    if (a >= 1000)    return (v / 1000).toFixed(a >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k';
    return String(Math.round(v));
  };

  /**
   * Wie viele Beschriftungen die x-Achse vertraegt.
   * Jede zweite oder jede fuenfte - nie alle, sonst ueberlappen sie.
   */
  const tickEvery = (count, plotWidth) =>
    Math.max(1, Math.ceil(count / Math.max(3, Math.floor(plotWidth / 78))));

  /**
   * Das Hauptdiagramm: Einnahmen und Ausgaben je Zeitabschnitt, und darueber
   * die laufende Summe.
   *
   * ZWEI BALKEN NEBENEINANDER, NICHT EINER GESTAPELT. Gestapelt sagt nur, wie
   * viel insgesamt bewegt wurde; nebeneinander sieht man sofort, ob ein
   * Zeitraum mehr eingebracht oder mehr gekostet hat - und genau danach wird
   * gefragt.
   *
   * DIE LINIE HAT IHRE EIGENE ACHSE. Die laufende Summe waechst ueber Monate
   * weit ueber jeden Einzelbalken hinaus; auf derselben Skala waeren die
   * Balken eine Fussleiste. Rechts steht deshalb ihre eigene Beschriftung.
   */
  function barsWithLine(buckets, { currency = 'platinum', showLine = true, width = 720 } = {}) {
    if (!buckets?.length) return '';

    const W = Math.max(320, Math.round(width));
    const PLOT = { w: W - PAD.left - PAD.right, h: H - PAD.top - PAD.bottom };

    const maxBar = niceMax(Math.max(...buckets.map(b => Math.max(b.earned, b.spent)), 0));
    const cum = buckets.map(b => b.cumulative);
    const cumMax = Math.max(...cum, 0);
    const cumMin = Math.min(...cum, 0);
    /* Die Null bleibt im Bild, auch wenn die Summe nie negativ wird - sonst
       sagt die Linie "es ging aufwaerts" ueber einem Nullpunkt, der gar nicht
       zu sehen ist. */
    const cumSpan = niceMax(Math.max(cumMax, -cumMin, 1)) * (cumMin < 0 ? 2 : 1);
    const cumBase = cumMin < 0 ? -cumSpan / 2 : 0;

    const bw = PLOT.w / buckets.length;
    /* Zwei Balken plus Luft dazwischen und an den Seiten. */
    const barW = Math.max(1.5, bw * 0.32);
    const y = v => PAD.top + PLOT.h - (v / maxBar) * PLOT.h;
    const yc = v => PAD.top + PLOT.h - ((v - cumBase) / cumSpan) * PLOT.h;

    const gridVals = [0, 0.25, 0.5, 0.75, 1].map(f => maxBar * f);
    const grid = gridVals.map(v => `
      <line class="ch-grid" x1="${PAD.left}" x2="${PAD.left + PLOT.w}" y1="${n2(y(v))}" y2="${n2(y(v))}"/>
      <text class="ch-ylab" x="${PAD.left - 8}" y="${n2(y(v) + 3.5)}" text-anchor="end">${esc(short(v))}</text>`).join('');

    const every = tickEvery(buckets.length, PLOT.w);
    const bars = buckets.map((b, i) => {
      const cx = PAD.left + i * bw + bw / 2;
      const gap = barW * 0.12;
      const x1 = cx - barW - gap / 2;
      const x2 = cx + gap / 2;
      const he = Math.max(0, PAD.top + PLOT.h - y(b.earned));
      const hs = Math.max(0, PAD.top + PLOT.h - y(b.spent));
      const tip = `${b.label}: +${short(b.earned)} / −${short(b.spent)} ${currency}`;
      return `
        <g class="ch-bargroup"><title>${esc(tip)}</title>
          ${b.earned > 0 ? `<rect class="ch-bar is-earned" x="${n2(x1)}" y="${n2(y(b.earned))}" width="${n2(barW)}" height="${n2(he)}" rx="1.5"/>` : ''}
          ${b.spent > 0 ? `<rect class="ch-bar is-spent" x="${n2(x2)}" y="${n2(y(b.spent))}" width="${n2(barW)}" height="${n2(hs)}" rx="1.5"/>` : ''}
        </g>
        ${i % every === 0 ? `<text class="ch-xlab" x="${n2(cx)}" y="${H - 8}" text-anchor="middle">${esc(b.label)}</text>` : ''}`;
    }).join('');

    const linePath = buckets
      .map((b, i) => `${i ? 'L' : 'M'}${n2(PAD.left + i * bw + bw / 2)} ${n2(yc(b.cumulative))}`)
      .join(' ');

    const last = buckets[buckets.length - 1];

    /* Die rechte Achse gehoert der Linie und traegt deshalb ihre Farbe. Drei
       Marken reichen: oben, unten und - wenn die Summe ins Minus geht - die
       Null dazwischen. Mehr waeren Zahlen an einem Rand, an dem niemand
       genau abliest. */
    const cumTicks = [cumBase + cumSpan, ...(cumBase < 0 ? [0] : []), cumBase]
      .map(v => `<text class="ch-ylab is-cum" x="${PAD.left + PLOT.w + 8}" y="${n2(yc(v) + 3.5)}">${esc(short(v))}</text>`)
      .join('');

    const line = showLine ? `
      ${cumBase < 0 ? `<line class="ch-zero" x1="${PAD.left}" x2="${PAD.left + PLOT.w}" y1="${n2(yc(0))}" y2="${n2(yc(0))}"/>` : ''}
      <path class="ch-line" d="${linePath}"/>
      <circle class="ch-dot" cx="${n2(PAD.left + (buckets.length - 1) * bw + bw / 2)}" cy="${n2(yc(last.cumulative))}" r="3"/>
      ${cumTicks}` : '';

    return `
      <svg class="ch-svg" viewBox="0 0 ${W} ${H}" role="img">
        ${grid}${bars}${line}
      </svg>`;
  }

  /**
   * Der tatsaechliche Kontostand ueber die Zeit.
   *
   * WAS DIESES DIAGRAMM ANDERS MACHT ALS DAS DARUEBER: dort liegen die Werte
   * auf einem gleichmaessigen Raster, hier nicht. Ein Kontostand wird
   * gemessen, wenn das Spiel synchronisiert - und das passiert bei
   * Zonenwechseln, nicht zu festen Zeiten. Die x-Achse ist deshalb ECHTE ZEIT
   * und nicht der Index eines Kastens: zwei Messungen an einem Nachmittag
   * stehen dicht beieinander, eine Woche Pause ist eine Luecke.
   *
   * DIE LINIE IST GESTRICHELT, UND DAS IST KEINE ZIER. Zwischen zwei
   * Messungen weiss niemand, was der Stand war - er kann gestiegen und wieder
   * gefallen sein. Eine durchgezogene Linie waere eine Behauptung ueber
   * Zeit, in die wir nicht geschaut haben. Gemessen sind die Punkte.
   *
   * NULLBASIERT: Ein Geldbeutel, dessen Achse bei 4.000 anfaengt, macht aus
   * einer Schwankung von zwei Prozent ein Gebirge. Was hier interessiert, ist
   * das Verhaeltnis zum Ganzen.
   */
  function balanceLine(points, { width = 720, from = null, to = null } = {}) {
    if (!points?.length) return '';

    const W = Math.max(320, Math.round(width));
    const PLOT = { w: W - PAD.left - PAD.right, h: H - PAD.top - PAD.bottom };

    const t0 = from ?? points[0].at;
    const t1 = to ?? Math.max(points[points.length - 1].at, t0 + 1);
    const span = Math.max(1, t1 - t0);

    const max = niceMax(Math.max(...points.map(p => p.value), 1));
    const x = t => PAD.left + Math.min(1, Math.max(0, (t - t0) / span)) * PLOT.w;
    const y = v => PAD.top + PLOT.h - (v / max) * PLOT.h;

    const grid = [0, 0.5, 1].map(f => `
      <line class="ch-grid" x1="${PAD.left}" x2="${PAD.left + PLOT.w}" y1="${n2(y(max * f))}" y2="${n2(y(max * f))}"/>
      <text class="ch-ylab" x="${PAD.left - 8}" y="${n2(y(max * f) + 3.5)}" text-anchor="end">${esc(short(max * f))}</text>`).join('');

    const path = points.map((p, i) => `${i ? 'L' : 'M'}${n2(x(p.at))} ${n2(y(p.value))}`).join(' ');

    const dots = points.map(p => `
      <circle class="ch-dot is-balance" cx="${n2(x(p.at))}" cy="${n2(y(p.value))}" r="2.6">
        <title>${esc(new Date(p.at).toLocaleString('en-GB', {
          day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
        }))} — ${esc(short(p.value))}</title>
      </circle>`).join('');

    /* Anfang und Ende der Zeitachse beschriftet, sonst nichts: die Messpunkte
       liegen unregelmaessig, und eine Marke je Punkt waere bei dreissig
       Messungen ein Teppich. Wann ein einzelner gemessen wurde, sagt sein
       Tooltip. */
    const stamp = t => new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    const achse = `
      <text class="ch-xlab" x="${PAD.left}" y="${H - 8}" text-anchor="start">${esc(stamp(t0))}</text>
      <text class="ch-xlab" x="${PAD.left + PLOT.w}" y="${H - 8}" text-anchor="end">${esc(stamp(t1))}</text>`;

    return `
      <svg class="ch-svg" viewBox="0 0 ${W} ${H}" role="img">
        ${grid}<path class="ch-line is-balance" d="${path}"/>${dots}${achse}
      </svg>`;
  }

  /**
   * Die Rangliste: eine Zeile je Item, der Balken im Verhaeltnis zum groessten.
   * Kein SVG - eine Liste aus divs bleibt auswaehlbar und bricht sauber um.
   */
  function rankRows(rows, { money = String } = {}) {
    const max = Math.max(...rows.map(r => Math.max(r.earned, r.spent)), 1);
    return rows.map(r => {
      const we = (r.earned / max) * 100;
      const ws = (r.spent / max) * 100;
      /* Zwei Zahlen, weil es zwei Balken sind. Nur die Einnahmen zu beziffern
         war falsch herum: neben einem langen roten Balken stand eine gruene
         Zahl, und wer schnell liest, haelt sie fuer die des roten. */
      return `
        <div class="ch-rank-row" title="${esc(r.name)} · ${r.trades} trade${r.trades === 1 ? '' : 's'}">
          <span class="ch-rank-name">${esc(r.name)}</span>
          <span class="ch-rank-bars">
            ${r.earned > 0 ? `<span class="ch-rank-bar is-earned" style="width:${n2(we)}%"></span>` : ''}
            ${r.spent > 0 ? `<span class="ch-rank-bar is-spent" style="width:${n2(ws)}%"></span>` : ''}
          </span>
          <span class="ch-rank-val">
            ${r.earned > 0 ? `<b class="is-positive">+${esc(money(r.earned))}</b>` : ''}
            ${r.spent > 0 ? `<b class="is-negative">−${esc(money(r.spent))}</b>` : ''}
          </span>
        </div>`;
    }).join('');
  }

  return { series, byItem, walletWindow, barsWithLine, balanceLine, rankRows, pickBucket, short };
})();
