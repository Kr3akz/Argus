/**
 * Prueft die Haendler-Tabelle gegen die Warenlisten im Wiki.
 *
 * WARUM ES DAS GIBT: src/core/vendors.js ist die einzige Tabelle im Projekt,
 * die weder aus DEs Export noch aus den Droptabellen stammt - Haendlerware
 * faellt nirgends, also fuehrt DE sie nicht. Sie ist abgeschrieben, und
 * abgeschriebenes veraltet: DE dreht an Preisen, haengt eine Waffe an einen
 * bestehenden Laden, verschiebt eine Rangschranke. Nichts davon faellt in der
 * Oberflaeche auf - es steht dann einfach eine falsche Zahl da.
 *
 * Geholt wird dieselbe Seite, aus der die Tabelle stammt, ueber die MediaWiki-
 * API (action=parse). Verglichen werden Posten, Preise und Rangschranken.
 *
 *   node tools/check-vendor-wares.mjs            alle Laeden
 *   node tools/check-vendor-wares.mjs otak       nur einer
 *
 * Exit-Code 1, wenn etwas abweicht.
 *
 * WAS DER PRUEFER NICHT KANN: Das Wiki setzt seine Warenkarten in drei
 * verschiedenen Vorlagen, und Kosmetik, Mods und Arcanes stehen in derselben
 * Liste wie die Bauplaene. Alles, was hier NICHT in der Tabelle steht, wird
 * deshalb nur gezaehlt und nicht bemaengelt - sonst meldete jeder Lauf zwanzig
 * "fehlende" Captura-Szenen, die bewusst fehlen. Umgekehrt gilt es strikt: was
 * in der Tabelle steht und im Wiki nicht mehr vorkommt, ist ein Fund.
 */
import { SHOPS } from '../src/core/vendors.js';

const API = 'https://wiki.warframe.com/api.php';
const USER_AGENT = 'Argus/0.1 (persoenlicher Mastery-Planer)';

/* Drei Vorlagen im Umlauf - alle setzen den Namen in einen fetten schwarzen
   Span, mal mit Leerzeichen im style, mal ohne, mal 700 statt bold. */
const NAME_RE = /<span style="color:\s?black;\s*font-weight:\s?(?:700|bold);[^"]*">([\s\S]*?)<\/span>/g;

const entzerre = s => s
  .replace(/<[^>]+>/g, '')
  .replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&#160;|&nbsp;/g, ' ')
  .replace(/\s+/g, ' ').trim();

async function wareList(page) {
  const url = `${API}?action=parse&page=${encodeURIComponent(page)}&prop=text&format=json&formatversion=2`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = (await res.json())?.parse?.text || '';

  const marken = [];
  let m;
  NAME_RE.lastIndex = 0;
  while ((m = NAME_RE.exec(html)) !== null) marken.push({ name: entzerre(m[1]), end: m.index });

  const out = [];
  let prev = 0;
  for (const marke of marken) {
    const seg = html.slice(prev, marke.end);
    prev = marke.end + 1;

    /* Preis mit Tooltip: die Waehrung steht als data-param-name daneben. */
    const preise = [];
    for (const re of [
      /data-param-name="([^"]+)"[\s\S]{0,1500}?<span style="[^"]*">([\d,.]+)<\/span>/g,
      /data-param-name="([^"]+)"[\s\S]{0,1500}?<span class="[^"]*" style="[^"]*">([\d,.]+)<\/span>/g
    ]) {
      let c;
      while ((c = re.exec(seg)) !== null) {
        const zeile = { currency: c[1], amount: Number(c[2].replace(/,/g, '')) };
        if (!preise.some(p => p.currency === zeile.currency && p.amount === zeile.amount)) preise.push(zeile);
      }
    }
    /* Ohne Tooltip: nackte Zahl, Waehrung nur als Bild (Ansehen, Fergolyte). */
    if (!preise.length) {
      const zahl = seg.match(/<span style="[^"]*text-shadow[^"]*">([\d,.]+)<\/span>/g);
      if (zahl) preise.push({ currency: null, amount: Number(entzerre(zahl[zahl.length - 1]).replace(/,/g, '')) });
    }

    const rang = entzerre(seg).match(/Rank \d+ ?: ?[A-Za-z' &-]{2,26}/g);
    out.push({ name: marke.name, preise, rank: rang ? rang[rang.length - 1] : null });
  }
  return out;
}

/* Der Laden schreibt "Oraxia Chassis Blueprint", die Tabelle fuehrt Item und
   Teil getrennt. Beides auf dieselbe Form bringen, bevor verglichen wird. */
const schluessel = s => String(s || '').toLowerCase()
  .replace(/\s+blueprint$/, '').replace(/[^a-z0-9]/g, '');

const nurEins = process.argv[2];
const laeden = nurEins ? SHOPS.filter(s => s.key === nurEins) : SHOPS;
if (!laeden.length) {
  console.error(`Kein Laden mit dem Schluessel "${nurEins}".`);
  process.exit(1);
}

let funde = 0;

for (const shop of laeden) {
  let wiki;
  try {
    wiki = await wareList(shop.wiki);
  } catch (err) {
    console.log(`\n${shop.key}: Seite "${shop.wiki}" nicht lesbar (${err.message})`);
    funde++;
    continue;
  }

  const imWiki = new Map();
  for (const w of wiki) if (!imWiki.has(schluessel(w.name))) imWiki.set(schluessel(w.name), w);

  const meldungen = [];
  const gesehen = new Set();

  for (const ware of shop.wares) {
    const name = ware.part ? `${ware.item} ${ware.part}` : ware.item;
    /* wikiName traegt die Faelle, in denen der Laden anders schreibt als der
       Katalog - die Tabelle folgt dem Katalog, weil an ihm der Abgleich
       haengt, und der Pruefer muss trotzdem den richtigen Posten finden. */
    const k = schluessel(ware.wikiName || name);
    gesehen.add(k);
    const treffer = imWiki.get(k);

    if (!treffer) {
      meldungen.push(`fehlt im Wiki: ${name}`);
      continue;
    }

    /* Preise der Reihe nach. "either" fuehrt denselben Betrag zweimal - im
       Wiki steht er als zwei Karten, hier als eine Zeile. */
    const erwartet = shop.pay === 'either' ? [ware.c[0]] : ware.c;
    const gefunden = treffer.preise.map(p => p.amount);
    const passt = erwartet.every((betrag, i) =>
      shop.pay === 'either' ? gefunden.includes(betrag) : gefunden[i] === betrag);
    if (!passt) {
      meldungen.push(`Preis: ${name} steht mit ${erwartet.join(' + ')}, im Wiki ${gefunden.join(' + ') || '?'}`);
    }

    const rangWiki = treffer.rank ? treffer.rank.replace(/\s+/g, ' ') : null;
    if ((ware.rank || null) !== (rangWiki || null) &&
        schluessel(ware.rank || '') !== schluessel(rangWiki || '')) {
      meldungen.push(`Rang: ${name} steht mit "${ware.rank || '-'}", im Wiki "${rangWiki || '-'}"`);
    }
  }

  /* Neu im Laden - nur zaehlen, nicht bemaengeln: das meiste davon ist
     Kosmetik, die hier bewusst nicht steht. */
  const neu = wiki.filter(w => !gesehen.has(schluessel(w.name))).map(w => w.name);

  const kopf = meldungen.length ? 'FEHLER' : 'ok    ';
  console.log(`${kopf} ${shop.key.padEnd(12)} ${shop.wares.length} Posten geprueft, ${neu.length} weitere im Wiki`);
  for (const m of meldungen) console.log(`         ${m}`);
  funde += meldungen.length;

  if (process.env.ARGUS_VENDOR_VERBOSE && neu.length) {
    console.log(`         nicht in der Tabelle: ${neu.join(', ')}`);
  }
}

console.log(funde
  ? `\n${funde} Abweichung${funde === 1 ? '' : 'en'} - erst nachsehen, dann tippen.`
  : '\nAlles deckt sich mit dem Wiki.');
process.exit(funde ? 1 : 0);
