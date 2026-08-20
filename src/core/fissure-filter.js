/**
 * Void-Riss-Filter fuer den Main-Prozess.
 *
 * Die Regeln selbst stehen in src/renderer/fissure-filter.js und werden hier
 * nur eingelesen. Grund fuer den Umweg: Der Renderer laedt klassische Skripte
 * (die Oberflaeche kommt ueber loadFile, also file://, und dort blockiert
 * Chromium ES-Module), der Main-Prozess dagegen ist ESM. Eine zweite Kopie der
 * Tabelle waere naheliegend, muesste aber bei jeder Regelaenderung mitgezogen
 * werden - beim Zariman-Fehlalarm stand derselbe Fehler in beiden Kopien.
 * Deshalb: eine Datei, hier einmal beim Start geladen.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SHARED_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)), '..', 'renderer', 'fissure-filter.js');

/* Die Datei deklariert FissureFilter als const - der angehaengte return holt
   den Wert aus dem Funktionsrumpf wieder heraus. */
export const FissureFilter =
  new Function(`${readFileSync(SHARED_FILE, 'utf8')}\nreturn FissureFilter;`)();

/** "Void-Flut", "void flood" und "Flut" landen alle auf 'void flood'. */
export const canonicalMissionType = value => FissureFilter.canonicalMissionType(value);

/** Passt der Riss zu den Benachrichtigungs-Einstellungen? */
export const matchesFissureFilter = (fissure, settings) => FissureFilter.matches(fissure, settings);
