#!/usr/bin/env node
/**
 * Prueft die Handy-App (src/mobile) - ohne Browser, ohne Netz, ohne Handy.
 *
 *   node src/cli/mobile-test.js
 *
 * Teil 1  index.html: die CSP kennt den Hash der Import-Map, jede Datei, auf
 *         die die Seite und das Manifest zeigen, gibt es.
 * Teil 2  Die Module der App und die aus src/core, die sie mitbenutzt, laden
 *         so, wie ein Browser sie laedt: node:fs, node:path & Co. zeigen auf
 *         die Ersatzteile in src/mobile/shims. Fehlt dort etwas, das ein Modul
 *         braucht, faellt das hier auf - im Browser stuende die App sonst
 *         leer da, ohne dass es jemand am PC merkt.
 * Teil 3  Live-Tracker: Beispiel-Weltzustand durch formatWorldState und
 *         buildWorldView, jede Unterseite gezeichnet. Kein "undefined", kein
 *         "NaN", und fremder Text kommt entschaerft an.
 * Teil 4  Foundry, Ziele, Inventar und Drops - vom Zuschnitt in
 *         core/phone-views.js bis zur fertigen Seite.
 * Teil 5  Kopplungscodes: was core/phone.js erzeugt, liest die App - und was
 *         nicht auf einen PC im Heimnetz zeigt, nimmt sie nicht an.
 */
import { registerHooks } from 'node:module';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, '..');
const MOBILE = path.join(SRC, 'mobile');
const CORE = path.join(SRC, 'core');
const ASSETS = path.join(SRC, 'renderer', 'assets');

let fehler = 0;
const ok = (label, cond, extra = '') => {
  if (!cond) fehler++;
  console.log(`  ${cond ? 'ok    ' : 'FEHLER'} ${label}${extra ? '  -> ' + extra : ''}`);
};

/* ------------------------------------------------------------------------ */
console.log('\n=== Teil 1: index.html und Manifest ===');

const html = await readFile(path.join(MOBILE, 'index.html'), 'utf8');
const importMapText = /<script type="importmap">([\s\S]*?)<\/script>/.exec(html)?.[1];
ok('Import-Map vorhanden', !!importMapText);
const hash = 'sha256-' + createHash('sha256').update(importMapText || '', 'utf8').digest('base64');
ok('CSP erlaubt genau diese Import-Map', html.includes(`'${hash}'`), html.includes(`'${hash}'`) ? '' : `richtig waere '${hash}'`);
const importMap = JSON.parse(importMapText || '{}').imports || {};
ok('kein weiteres Skript im Dokument', (html.match(/<script(?![^>]*\bsrc=)[^>]*>/g) || []).length === 1);

/* Was die App unter welchem Pfad erwartet - so legen es phone-server.js und
   tools/build-mobile.mjs an: assets/ aus dem Renderer, core/ aus src/core. */
function served(rel) {
  const p = rel.replace(/^\.\//, '').replace(/[?#].*$/, '');
  if (p.startsWith('assets/')) return path.join(ASSETS, p.slice(7));
  if (p.startsWith('core/')) return path.join(CORE, p.slice(5));
  return path.join(MOBILE, p);
}
for (const [, ref] of html.matchAll(/(?:href|src)="([^"#:]+)"/g)) {
  ok(`index.html -> ${ref}`, existsSync(served(ref)));
}
for (const [spec, ziel] of Object.entries(importMap)) {
  ok(`Import-Map ${spec} -> ${ziel}`, existsSync(served(ziel)));
}
const manifest = JSON.parse(await readFile(path.join(MOBILE, 'manifest.webmanifest'), 'utf8'));
ok('Manifest: standalone (sonst gibt es auf iOS keine Push-Meldungen)', manifest.display === 'standalone');
/* Ohne start_url nimmt iOS beim "Zum Home-Bildschirm" die Adresse, auf der
   man gerade steht - samt #pair=... aus dem QR-Code. Mit start_url waere der
   Kopplungscode in der installierten App weg. */
ok('Manifest: kein start_url (der Kopplungscode soll mitkommen)', !('start_url' in manifest));
for (const i of manifest.icons || []) ok(`Manifest-Symbol ${i.src}`, existsSync(served(i.src)));

/* ------------------------------------------------------------------------ */
console.log('\n=== Teil 2: Module wie im Browser ===');

/* Jede Datei der App und von src/core, die ueber die App geladen wird,
   bekommt ?browser angehaengt - eine eigene Instanz, getrennt von den
   Modulen, die dieser Test selbst fuer Node laedt. node:* zeigt fuer sie
   auf die Ersatzteile, ../core/ aus der App in den echten Ordner. */
const SHIMS = Object.fromEntries(Object.entries(importMap).map(([k, v]) => [k, pathToFileURL(served(v)).href]));
const MOBILE_URL = pathToFileURL(MOBILE + path.sep).href;
const CORE_URL = pathToFileURL(CORE + path.sep).href;
const imBrowser = url => url && url.includes('?browser');

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!imBrowser(context.parentURL)) return nextResolve(specifier, context);
    if (specifier.startsWith('node:')) {
      if (!SHIMS[specifier]) throw new Error(`${specifier} fehlt in der Import-Map (gebraucht von ${context.parentURL})`);
      return { url: SHIMS[specifier] + '?browser', shortCircuit: true };
    }
    if (!specifier.startsWith('.')) throw new Error(`nackter Name ${specifier} in ${context.parentURL} - im Browser nicht aufloesbar`);
    let url = new URL(specifier, context.parentURL.replace(/\?browser$/, '')).href;
    if (url.startsWith(MOBILE_URL + 'core/')) url = CORE_URL + url.slice(MOBILE_URL.length + 5);
    if (!url.startsWith(MOBILE_URL) && !url.startsWith(CORE_URL)) throw new Error(`${specifier} zeigt aus der App heraus`);
    return { url: url + '?browser', shortCircuit: true };
  }
});

const laden = async rel => import(pathToFileURL(path.join(MOBILE, rel)).href + '?browser');
let web, ui, Live, Foundry, Inv, Drops, More, pairing, core;
try {
  web = await laden('lib/source-web.js');
  ui = await laden('lib/ui.js');
  Live = await laden('views/live.js');
  Foundry = await laden('views/foundry.js');
  Inv = await laden('views/inventory.js');
  Drops = await laden('views/drops.js');
  More = await laden('views/more.js');
  pairing = await laden('lib/pairing.js');
  core = {
    ws: await import(CORE_URL + 'worldstate.js?browser'),
    view: await import(CORE_URL + 'world-view.js?browser'),
    drops: await import(CORE_URL + 'drop-search.js?browser'),
    tables: await import(CORE_URL + 'droptables.js?browser')
  };
  ok('alle Module laden mit den Ersatzteilen', true);
} catch (err) {
  ok('alle Module laden mit den Ersatzteilen', false, err.message);
  console.log(`\n${fehler} FEHLER - ohne Module geht es nicht weiter.`);
  process.exit(1);
}
ok('source-web.js bietet, was app.js ruft', ['world', 'drops', 'marketSearch', 'price'].every(f => typeof web[f] === 'function'));

/* Jedes Modul der App: alle relativen Importe zeigen auf etwas, das es gibt. */
function alleDateien(dir) {
  return readdirSync(dir).flatMap(n => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? alleDateien(p) : [p];
  });
}
for (const datei of alleDateien(MOBILE).filter(f => f.endsWith('.js'))) {
  const text = await readFile(datei, 'utf8');
  for (const [, spec] of text.matchAll(/(?:import|from)\s*\(?\s*['"](\.[^'"]+)['"]/g)) {
    let ziel = path.resolve(path.dirname(datei), spec);
    if (ziel.startsWith(path.join(MOBILE, 'core') + path.sep)) ziel = path.join(CORE, path.relative(path.join(MOBILE, 'core'), ziel));
    if (!existsSync(ziel)) ok(`${path.relative(SRC, datei)}: ${spec}`, false, 'Datei fehlt');
  }
}

/* ------------------------------------------------------------------------ */
console.log('\n=== Teil 3: Live-Tracker ===');

const sample = await import('./fixtures/mobile-sample.js');
const jetzt = Date.now();
const raw = sample.rawWorldState(jetzt);
raw.fissures[0].node = '<img src=x onerror=alert(1)>';
const view = core.view.buildWorldView(core.ws.formatWorldState(raw, { source: 'warframestat' }), {});
ok('sechs Uhren', view.cycles?.length === 6);
ok('Risse durchgereicht', view.fissures?.length === raw.fissures.length, String(view.fissures?.length));
ok('Baro ist da', view.traders?.baro?.active === true);

const kaputt = s => /undefined|NaN|\[object Object\]/.test(s);
for (const [page] of Live.PAGES) {
  const st = { fissureKind: page === 'fissures' ? 'normal' : undefined };
  const out = Live.render(view, page, st);
  ok(`Seite ${page}: gezeichnet`, out.length > 200, `${out.length} Zeichen`);
  ok(`Seite ${page}: kein undefined/NaN/[object Object]`, !kaputt(out), (out.match(/.{40}(undefined|NaN|\[object Object\]).{20}/) || [''])[0]);
}
const risse = Live.render(view, 'fissures', { fissureKind: 'normal' });
ok('fremder Text wird entschaerft', !risse.includes('<img src=x') && risse.includes('&lt;img src=x'));
ok('Steel Path und Stuerme getrennt',
   (Live.render(view, 'fissures', { fissureKind: 'sp' }).match(/class="row/g) || []).length === raw.fissures.filter(f => f.isHard).length);
ok('Stufenfilter', (Live.render(view, 'fissures', { fissureKind: 'normal', fissureTier: 'Axi' }).match(/class="row/g) || []).length === 1);
ok('Zaehler fuer die Unterseiten', Live.counts(view).fissures === raw.fissures.length);

for (const [ms, erwartet] of [[90 * 1000, '1m 30s'], [2 * 3600000 + 5 * 60000, '2h 5m'], [3 * 86400000 + 4 * 3600000, '3d 4h'], [-5, 'now']]) {
  ok(`Restzeit ${erwartet}`, ui.left(jetzt + ms, jetzt) === erwartet, ui.left(jetzt + ms, jetzt));
}
ok('Bilder nur aus https oder mitgeliefert', !ui.img('javascript:alert(1)').includes('javascript') && ui.img('https://x/y.png').includes('https://x/y.png'));

const assetPfade = Object.values(ui.ASSET).flatMap(v => (typeof v === 'string' ? [v] : typeof v === 'object' ? Object.values(v) : []));
assetPfade.push(...['lith', 'meso', 'neo', 'axi', 'requiem', 'omnia'].map(t => ui.ASSET.relic(t)));
for (const a of assetPfade) ok(`mitgeliefertes Bild ${a}`, existsSync(served(a)));

/* ------------------------------------------------------------------------ */
console.log('\n=== Teil 4: Foundry, Ziele, Inventar, Drops ===');

/* Der Zuschnitt laeuft am PC (Node) - also die normale Fassung. */
const views = await import('../core/phone-views.js');
const f = views.slimFoundry(sample.foundry(jetzt));
const fOut = Foundry.renderFoundry(f);
ok('Foundry: fertig und im Bau getrennt', /Ready to claim/.test(fOut) && /done in/.test(fOut));
ok('Foundry: Helminth', /Roar/.test(fOut));
ok('Foundry: kein undefined/NaN', !kaputt(fOut));
ok('Foundry leer: freundlicher Hinweis', /No foundry data yet/.test(Foundry.renderFoundry(views.slimFoundry({ ok: false, code: 'empty' }))));

const d = views.slimDashboard(sample.dashboard(jetzt));
ok('Ziele: erledigte hinten', d.goals.at(-1).done === true && !d.goals[0].done);
const gOut = Foundry.renderGoals(d, {});
ok('Ziele: gezeichnet, Einkaufsliste dabei', /Dagath/.test(gOut) && /Shopping list/.test(gOut));
ok('Ziele: Bezugsquelle einer Mod', /Baro Ki&#39;Teer|Baro Ki'Teer/.test(gOut));
ok('Ziele: kein undefined/NaN', !kaputt(gOut));

const fx = sample.inventory(jetzt);
const inv = views.slimInventory(fx.inventory, fx.ducats);
ok('Inventar: nur eigene Relikte', inv.relics.length === 5 && inv.relics.every(r => r.count > 0));
ok('Inventar: wertvolle Mods ab 10 p, teuerste zuerst', inv.valuable.map(m => m.name).join() === 'Arcane Energize,Primed Continuity,Blind Rage');
for (const [name, out] of [
  ['Relikte', Inv.renderRelics(inv, {})], ['Sets', Inv.renderSets(inv, {})], ['Teile', Inv.renderParts(inv, {})],
  ['Mods', Inv.renderMods(inv)], ['Geldbeutel', Inv.wallet(inv)]
]) ok(`Inventar ${name}: gezeichnet ohne undefined/NaN`, out.length > 100 && !kaputt(out));
ok('Inventar: Suche filtert', (Inv.renderRelics(inv, { relicQuery: 'axi' }).match(/class="row/g) || []).length === 1);
ok('Inventar leer: markiert', views.slimInventory({ ok: false, code: 'empty' }).empty === true);

const pOut = Inv.renderPrices({ priceQuery: 'serr', pricePick: { name: 'Serration', slug: 'serration' }, price: { min: 8, median: 9, offers: 5, online: true } });
ok('Preis: gezeichnet', /Cheapest seller/.test(pOut) && !kaputt(pOut));

const de = sample.deDropTables();
const rows = core.drops.buildDropRows(de, { live: core.tables.liveRelics(de), wf: [] });
const treffer = core.drops.searchDrops(rows, { q: 'serration', mode: 'item' });
ok('Drops: Suche im Browser findet Mission und Gegner', treffer.total >= 2, String(treffer.total));
ok('Drops: lebende Relikte erkannt', core.tables.liveRelics(de).has('Axi A15'));
const dOut = Drops.body({ dropQuery: 'serration', dropMode: 'item', dropResult: { rows: treffer.rows, total: treffer.total, shown: treffer.rows.length } });
ok('Drops: gezeichnet', /Apollodorus/.test(dOut) && !kaputt(dOut));
const pcDrops = views.slimDrops({ rows: sample.drops('serration').rows, total: 2 });
ok('Drops vom PC: zugeschnitten', pcDrops.rows.length === 2 && pcDrops.shown === 2);
ok('Drop-Optionen: Modus geprueft', views.dropOptions({ q: 'x', mode: 'boese' }).mode === 'item');

/* ------------------------------------------------------------------------ */
console.log('\n=== Teil 5: Kopplungscodes ===');

const ordner = await mkdtemp(path.join(tmpdir(), 'argus-mobile-'));
try {
  const { setDataDir } = await import('../core/paths.js');
  setDataDir(ordner);
  const phone = await import('../core/phone.js');
  phone._resetForTest();
  const p = await phone.createPairing({ pcName: 'KAAN-PC', baseUrl: 'http://192.168.178.20:47120' });
  const gelesen = pairing.parseCode(p.code);
  ok('ein Code vom PC wird gelesen', gelesen?.name === 'KAAN-PC' && gelesen.url === 'http://192.168.178.20:47120'
     && gelesen.id === p.device.id && gelesen.key.length === 87);
  ok('...auch als ganze Adresse (eingefuegt)', pairing.parseCode(p.url)?.token === gelesen.token);

  const fremd = (u) => Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p.code, 'base64url').toString()), u })).toString('base64url');
  for (const [u, warum] of [
    ['https://boese.example', 'https statt Heimnetz'],
    ['http://boese.example', 'Name statt IP-Adresse'],
    ['http://192.168.1.5:47120/umweg', 'mit Pfad'],
    ['javascript:alert(1)', 'javascript:'],
    ['http://192.168.1.5:47120?x=1', 'mit Abfrage']
  ]) ok(`abgelehnt: ${warum}`, pairing.parseCode(fremd(u)) === null);
  ok('abgelehnt: Unsinn', pairing.parseCode('kaputt') === null && pairing.parseCode('') === null);

  const reg = pairing.registerUrl(gelesen, { toJSON: () => ({ endpoint: 'https://web.push.apple.com/x', keys: { p256dh: 'a', auth: 'b' } }) });
  ok('Push-Abo geht an /pair/push des PCs', reg.startsWith('http://192.168.178.20:47120/pair/push?t='));
  ok('"Mein PC" traegt die Kennung hinter #', pairing.pcViewUrl(gelesen).startsWith('http://192.168.178.20:47120/#t='));

  /* "More" in jedem Zustand. */
  const push = { ios: true, android: false, standalone: false, supported: true, needsInstall: true, permission: 'default' };
  const outs = [
    More.render({ mode: 'web', pc: null, push: { ...push, standalone: true, needsInstall: false } }),
    More.render({ mode: 'web', pc: { ...gelesen, pairedAt: jetzt }, pcViewUrl: pairing.pcViewUrl(gelesen), push }),
    More.render({ mode: 'web', pc: { ...gelesen, pairedAt: jetzt }, pcViewUrl: '#', push: { ...push, standalone: true, needsInstall: false } }),
    More.render({ mode: 'web', pc: { ...gelesen, pairedAt: jetzt }, pcViewUrl: '#', push: { ...push, standalone: true, needsInstall: false },
                  subscribed: true, registerUrl: reg }),
    More.render({ mode: 'pc', hello: { pc: { name: 'KAAN-PC', version: '1.22.0' }, device: { name: 'iPhone', types: { fissure: true } } } })
  ];
  ok('More: Paste-Knopf ohne Kopplung', /Paste pairing code/.test(outs[0]));
  ok('More: iPhone im Browser -> Home-Bildschirm', /Add to Home Screen/.test(outs[1]) && /Copy pairing code/.test(outs[1]));
  ok('More: installiert -> Push einschalten', /Turn on notifications/.test(outs[2]));
  ok('More: nach dem Abo -> zum PC', /Connect to KAAN-PC/.test(outs[3]));
  ok('More: zuhause -> Meldungsarten', /Void fissures/.test(outs[4]) && /data-act="type-toggle"/.test(outs[4]));
  ok('More: kein undefined/NaN', outs.every(o => !kaputt(o)));
} finally {
  await rm(ordner, { recursive: true, force: true });
}

console.log(`\n${fehler ? `${fehler} FEHLER` : 'Alles bestanden.'}`);
process.exitCode = fehler ? 1 : 0;
