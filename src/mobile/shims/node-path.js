/* node:path fuer den Handy-Browser.
 *
 * WARUM ES DAS GIBT: Die Handy-App rechnet den Live-Tracker und die
 * Droptabellen mit denselben Modulen aus src/core wie der PC - eine zweite
 * Fassung derselben Regeln liefe sonst irgendwann auseinander. Einige dieser
 * Module holen sich node:path, node:fs und node:url fuer ihre Zwischenspeicher
 * auf der Platte. Die Import-Map in index.html lenkt diese Namen hierher.
 *
 * Gebraucht wird im Browser nur, was beim LADEN der Module laeuft - paths.js
 * rechnet beim Start einmal mit dirname und resolve. Alles, was eine Datei
 * lesen oder schreiben will, ruft die Handy-App nie auf; die Platzhalter in
 * node-fs*.js werfen dann einen Fehler, statt still etwas vorzutaeuschen.
 * src/cli/mobile-test.js laedt die Module mit genau diesen Ersatzteilen und
 * faellt, sobald ein Modul etwas braucht, das hier fehlt. */

const teile = p => String(p).split('/').filter(s => s && s !== '.');

export function normalize(p) {
  const absolut = String(p).startsWith('/');
  const out = [];
  for (const s of teile(p)) {
    if (s === '..') { if (out.length && out.at(-1) !== '..') out.pop(); else if (!absolut) out.push('..'); }
    else out.push(s);
  }
  return (absolut ? '/' : '') + out.join('/') || (absolut ? '/' : '.');
}

export const join = (...ps) => normalize(ps.filter(p => p !== '').join('/'));

export function resolve(...ps) {
  let r = '';
  for (const p of ps) r = String(p).startsWith('/') ? String(p) : `${r}/${p}`;
  return normalize(r.startsWith('/') ? r : `/${r}`);
}

export function dirname(p) {
  const s = String(p).replace(/\/+$/, '');
  const i = s.lastIndexOf('/');
  return i > 0 ? s.slice(0, i) : (i === 0 ? '/' : '.');
}

export function basename(p, ext = '') {
  const b = String(p).replace(/\/+$/, '').split('/').pop() || '';
  return ext && b.endsWith(ext) ? b.slice(0, -ext.length) : b;
}

export function extname(p) {
  const b = basename(p);
  const i = b.lastIndexOf('.');
  return i > 0 ? b.slice(i) : '';
}

export const sep = '/';
export const delimiter = ':';

const path = { normalize, join, resolve, dirname, basename, extname, sep, delimiter };
path.posix = path;
export default path;
