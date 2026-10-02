/* node:fs fuer den Handy-Browser - siehe node-path.js.
 *
 * Eine Datei gibt es im Browser nicht: existsSync sagt "nein", und wer
 * trotzdem lesen will, bekommt einen Fehler statt einer erfundenen Antwort. */

const nichtImBrowser = name => () => { throw new Error(`fs.${name} is not available in the browser`); };

export const existsSync = () => false;
export const readFileSync = nichtImBrowser('readFileSync');
export const writeFileSync = nichtImBrowser('writeFileSync');
export const mkdirSync = nichtImBrowser('mkdirSync');
export const createWriteStream = nichtImBrowser('createWriteStream');

export default { existsSync, readFileSync, writeFileSync, mkdirSync, createWriteStream };
