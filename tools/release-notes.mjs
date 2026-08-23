#!/usr/bin/env node
/**
 * Schneidet den Abschnitt einer Version aus CHANGELOG.md und gibt ihn aus.
 * Der Workflow macht daraus die Release-Notiz - und die App zeigt genau diesen
 * Text im Update-Fenster, bevor irgendetwas geladen wird.
 *
 * WARUM NICHT generate_release_notes VON GITHUB:
 *   Das listet Pull Requests. Hier geht alles direkt auf main, also blieb davon
 *   genau eine Zeile uebrig ("Full Changelog: ..."), die der Filter in
 *   core/updates.js auch noch wegwirft - das Update-Fenster stand leer.
 *
 * WARUM EIN RUECKFALL AUF DIE COMMITS:
 *   Wer eine Version veroeffentlicht und den Changelog-Eintrag vergisst, soll
 *   kein leeres Fenster ausliefern. Haesslich ist besser als nichts, und der
 *   Hinweis oben im Text sagt, woran es lag.
 *
 *   node tools/release-notes.mjs 1.2.3
 */
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const version = (process.argv[2] || process.env.VERSION || '').replace(/^v/, '');
if (!version) {
  console.error('Aufruf: node tools/release-notes.mjs <version>');
  process.exit(1);
}

/** Der Abschnitt zwischen "## [1.2.3]" und der naechsten "## "-Zeile. */
function ausChangelog() {
  if (!existsSync('CHANGELOG.md')) return null;
  const zeilen = readFileSync('CHANGELOG.md', 'utf8').split(/\r?\n/);

  /* Eckige Klammern sind im Format vorgesehen, aber nicht Pflicht - beide
     Schreibweisen finden. */
  const kopf = new RegExp('^##\\s+\\[?' + version.replace(/\./g, '\\.') + '\\]?(\\s|$)');
  const start = zeilen.findIndex(z => kopf.test(z));
  if (start === -1) return null;

  const rest = zeilen.slice(start + 1);
  const ende = rest.findIndex(z => /^##\s/.test(z));
  const abschnitt = (ende === -1 ? rest : rest.slice(0, ende)).join('\n').trim();
  return abschnitt || null;
}

/** Betreffzeilen seit dem letzten Tag - der Rueckfall. */
function ausCommits() {
  try {
    /* Der Tag dieser Veroeffentlichung existiert beim Bauen noch nicht, der
       zuletzt vergebene ist also der vorherige. */
    const tags = execSync('git tag --sort=-creatordate', { encoding: 'utf8' })
      .split('\n').map(t => t.trim()).filter(Boolean);
    const seit = tags.find(t => t !== 'v' + version);
    const bereich = seit ? `${seit}..HEAD` : 'HEAD';
    const log = execSync(`git log --no-merges --pretty=format:%s ${bereich}`, { encoding: 'utf8' })
      .split('\n').map(z => z.trim()).filter(Boolean);
    if (!log.length) return null;
    return [
      '_No changelog entry for this version — the commit subjects have to do._',
      '',
      ...log.map(z => '- ' + z)
    ].join('\n');
  } catch {
    return null;
  }
}

const text = ausChangelog() || ausCommits() || '_No release notes for this version._';
process.stdout.write(text + '\n');
