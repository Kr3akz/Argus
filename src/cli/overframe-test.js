/**
 * Testet den Overframe-Import im echten Electron-Kontext.
 * Aufruf:  npx electron src/cli/overframe-test.js
 */
import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadCatalog } from '../core/catalog.js';
import { loadMods } from '../core/mods.js';
import { evaluateBuild } from '../core/builds.js';
import {
  parseBuildId, fetchBuild, toBuild, unknownModIds, mergeNames, USER_AGENT
} from '../core/overframe.js';

process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'));

const BUILD_ID = process.argv[2] || '86364';

function scrape(url) {
  return new Promise((resolve, reject) => {
    const w = new BrowserWindow({ show: false, webPreferences: { offscreen: true, images: false } });
    const fin = (fn, a) => { try { w.destroy(); } catch {} fn(a); };
    const t = setTimeout(() => fin(reject, new Error('Zeitüberschreitung')), 25000);

    w.webContents.on('did-finish-load', async () => {
      try {
        await new Promise(r => setTimeout(r, 2500));
        const names = await w.webContents.executeJavaScript(`(() => {
          const box = document.querySelector('[class*="buildSlots"]');
          if (!box) return null;
          const all = [...box.querySelectorAll('[class*="Mod_"]')];
          const cards = [];
          all.forEach(c => { if (!cards.some(u => u.contains(c) || c.contains(u))) cards.push(c); });
          return cards.map(c => {
            const lines = c.innerText.split('\\n').map(s => s.trim()).filter(Boolean);
            const hasDrain = /^[\\u2191\\u2193]?\\d+$/.test(lines[0] || '');
            return { drain: hasDrain ? lines[0] : null, name: hasDrain ? lines[1] : lines[0] };
          });
        })()`);
        clearTimeout(t); fin(resolve, names);
      } catch (e) { clearTimeout(t); fin(reject, e); }
    });
    w.webContents.on('did-fail-load', (_e, c, d) => { clearTimeout(t); fin(reject, new Error(d || c)); });
    w.loadURL(url, { userAgent: USER_AGENT });
  });
}

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const ok = (l, c, x = '') => console.log(`  ${c ? 'ok    ' : 'FEHLER'} ${l}${x ? '  -> ' + x : ''}`);
  try {
    const id = parseBuildId(BUILD_ID);
    console.log(`=== Overframe-Import, Build ${id} ===\n`);

    const catalog = await loadCatalog();
    const mods = await loadMods();
    const raw = await fetchBuild(id);
    ok('API erreichbar', !!raw.slots, raw.title + ' (' + raw.slots.length + ' Slots)');

    const scraped = await scrape(raw.url?.startsWith('http') ? raw.url : `https://overframe.gg/build/${id}/`);
    ok('Seite ausgelesen', Array.isArray(scraped) && scraped.length > 0,
       (scraped ? scraped.length : 0) + ' Karten');

    // Prüfsumme: drain aus API muss zum drain im DOM passen
    let checked = 0, match = 0;
    raw.slots.forEach((s, i) => {
      const d = scraped[i]?.drain;
      if (d == null) return;
      checked++;
      if (Math.abs(Number(String(d).replace(/[^\d]/g, ''))) === Math.abs(s.drain)) match++;
    });
    ok('Zuordnung stimmt', checked > 0 && match / checked >= 0.8, `${match}/${checked} Prüfwerte`);

    const { map, added } = mergeNames(raw, scraped.map(s => s.name), {});
    ok('Mapping gebaut', added > 0, added + ' IDs gelernt');

    const build = toBuild(raw, map, mods, catalog);
    ok('Item erkannt', !!build.itemUniqueName, build.itemName);
    ok('Mods aufgelöst', build.slots.length - build.unresolved > 0,
       `${build.slots.length - build.unresolved}/${build.slots.length} (${build.unresolved} offen)`);

    const ev = evaluateBuild(build, mods, new Set(), catalog.byUniqueName.get(build.itemUniqueName));
    ok('Kapazität plausibel', ev.used <= ev.capacity + 2, `${ev.used}/${ev.capacity}`);
    ok('Forma übernommen', ev.requirements.forma === raw.formas,
       `${ev.requirements.forma} (Overframe: ${raw.formas})`);

    console.log('\n  Mods im Build:');
    ev.slots.filter(Boolean).forEach(s =>
      console.log(`    ${(s.name || '?').padEnd(22)} Rang ${String(s.rank).padStart(2)}  ${String(s.drain).padStart(4)}${s.isAura ? '  (Aura)' : ''}`));

    console.log(`\n  Benötigt: ${ev.requirements.forma}x Forma, 1x ${ev.requirements.orokinLabel}`
              + `, ~${ev.requirements.endo.toLocaleString('de-DE')} Endo`);
    console.log('\nTest beendet.');
    app.exit(0);
  } catch (err) {
    console.error('\nFEHLGESCHLAGEN:', err.message);
    app.exit(1);
  }
});
