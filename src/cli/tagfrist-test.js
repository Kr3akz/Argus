#!/usr/bin/env node
/**
 * Prueft die Frist, nach der die Preisschilder wieder verschwinden.
 *
 * WARUM DAS EINEN EIGENEN DURCHLAUF BRAUCHT:
 *   Der Fundzeitpunkt ist nicht der Beginn der Bedenkzeit. Dazwischen liegt
 *   eine Vorphase, in der das Spiel auf die Mitspieler wartet. Gerechnet ab
 *   dem Fund verschwanden die Schilder nachgemessen 3,4 Sekunden zu frueh -
 *   bei noch drei Sekunden Restzeit auf der Uhr im Spiel.
 *
 *   Die Regel dagegen ist klein, aber sie hat zwei Fallen: sie darf die Frist
 *   nur VERLAENGERN (sonst drueckt die Vorphase sie auf sieben Sekunden), und
 *   sie braucht eine Obergrenze (sonst haelt eine fremde Zeitangabe das Dock
 *   beliebig lange ueber dem Spiel).
 *
 *   node src/cli/tagfrist-test.js
 */

/* Die Regel aus main.js, hier nachgebildet. Sie steht dort in einem
   Ereignisbehandler mitten im Hauptprozess und waere von aussen nicht
   aufrufbar - was sie TUT, ist aber genau dieser Dreisatz. */
const TAG_MAX_MS = 40000;

function frist(runde, meldungen) {
  let uhrBis = null;
  for (const sek of meldungen) {
    if (!(sek > 0)) continue;
    const bis = runde.jetzt(sek) + sek * 1000 + 2000;
    const deckel = runde.at + TAG_MAX_MS;
    const neu = Math.min(bis, deckel);
    const boden = Math.max(uhrBis ?? 0, runde.at + runde.seconds * 1000 + 2000);
    if (neu <= boden) continue;
    uhrBis = neu;
  }
  return uhrBis ?? runde.at + runde.seconds * 1000 + 2000;
}

console.log('=== Frist der Preisschilder ===\n');

let fehler = 0;
const pruefe = (was, ok, hinweis = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FEHL'}  ${was}${!ok && hinweis ? ' - ' + hinweis : ''}`);
  if (!ok) fehler++;
};

/* Die nachgemessene Runde, in Millisekunden ab dem Ausloeser:
     0      OpenVoidProjectionRewardScreenRMI
     6      Initialize timer true   5
     5354   Got rewards
     5356   Initialize timer nil   15
     20355  Relic reward screen shut down                */
const ECHT = {
  at: 0,
  seconds: 15,
  ankunft: { 5: 6, 15: 5356 },
  jetzt(sek) { return this.ankunft[sek] ?? 0; }
};
const SCHLUSS = 20355;

console.log('1. Die nachgemessene Runde');
const f = frist(ECHT, [5, 15]);
pruefe(`Frist liegt nach dem Schluss des Bildschirms (${f} >= ${SCHLUSS})`,
       f >= SCHLUSS, `${f} - das waere ${((SCHLUSS - f) / 1000).toFixed(2)} s zu frueh`);
pruefe('und nicht unnoetig weit danach (hoechstens 4 s)',
       f - SCHLUSS <= 4000, `${((f - SCHLUSS) / 1000).toFixed(2)} s zu spaet`);

console.log('\n2. Die Vorphase darf nicht verkuerzen');
const nurVor = frist(ECHT, [5]);
pruefe('allein "true 5" laesst die alte Frist stehen',
       nurVor === ECHT.at + 15 * 1000 + 2000, `${nurVor}`);

console.log('\n3. Eine langsame Vorphase');
/* Genau der Fall, an dem die erste Fassung gescheitert waere: kaeme die
   Bedenkzeit erst nach acht Sekunden, haette eine auf 7 s gedrueckte Frist
   die Schilder mittendrin abgeraeumt. */
const LANGSAM = { ...ECHT, ankunft: { 5: 6, 15: 8000 }, jetzt: ECHT.jetzt };
const fl = frist(LANGSAM, [5, 15]);
pruefe('Frist ueberlebt eine 8-Sekunden-Vorphase',
       fl >= 8000 + 15000, `${fl}`);

console.log('\n4. Die Obergrenze haelt');
/* Eine Zeitangabe aus einem anderen Zusammenhang - im Protokoll standen auch
   20 Sekunden - darf das Dock nicht beliebig lange stehen lassen. */
const FREMD = { ...ECHT, ankunft: { 5: 6, 15: 5356, 20: 19000 }, jetzt: ECHT.jetzt };
const ff = frist(FREMD, [5, 15, 20]);
pruefe(`nie laenger als ${TAG_MAX_MS / 1000} s nach dem Fund`,
       ff <= ECHT.at + TAG_MAX_MS, `${ff}`);

console.log('\n5. Ohne jede Zeitangabe');
pruefe('faellt auf die alte Rechnung zurueck',
       frist(ECHT, []) === ECHT.at + 15 * 1000 + 2000);

console.log(`\n=== ${fehler ? fehler + ' Fehler' : 'alles in Ordnung'} ===`);
process.exit(fehler ? 1 : 0);
