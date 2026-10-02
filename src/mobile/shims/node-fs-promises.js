/* node:fs/promises fuer den Handy-Browser - siehe node-path.js.
 *
 * Jede Funktion lehnt ab. Die Zwischenspeicher der Module (Katalog,
 * Droptabellen, Plaene) liegen am PC auf der Platte; im Browser haelt
 * die Handy-App selbst fest, was sie geladen hat (lib/source-web.js). */

const nichtImBrowser = name => async () => { throw new Error(`fs.${name} is not available in the browser`); };

export const readFile = nichtImBrowser('readFile');
export const writeFile = nichtImBrowser('writeFile');
export const mkdir = nichtImBrowser('mkdir');
export const rename = nichtImBrowser('rename');
export const unlink = nichtImBrowser('unlink');
export const stat = nichtImBrowser('stat');
export const readdir = nichtImBrowser('readdir');

export default { readFile, writeFile, mkdir, rename, unlink, stat, readdir };
