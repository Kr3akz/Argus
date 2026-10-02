/* node:url fuer den Handy-Browser - siehe node-path.js.
 *
 * paths.js rechnet beim Laden aus seiner eigenen Adresse den Projektordner
 * aus. Im Browser ist das eine https-Adresse statt file://; der Pfad darin
 * genuegt, benutzt wird das Ergebnis dort ohnehin nie. */

export function fileURLToPath(u) {
  return decodeURIComponent(new URL(String(u)).pathname);
}

export function pathToFileURL(p) {
  return new URL(`file://${encodeURI(String(p))}`);
}

export default { fileURLToPath, pathToFileURL };
