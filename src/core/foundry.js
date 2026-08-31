/**
 * Die Schmiede: was steht drin, und wann ist es fertig.
 *
 * WOHER DIE ZEITEN KOMMEN:
 *   Nicht aus einer Rechnung. `PendingRecipes` traegt zu jedem laufenden Bau
 *   ein `CompletionDate` - den Zeitpunkt, den DEs Server selbst gesetzt hat,
 *   als der Bau gestartet wurde. Boostet jemand mit Platin, verschiebt sich
 *   das Datum auf dem Server; wir lesen es beim naechsten Abruf einfach neu.
 *   Es gibt hier deshalb kein "geschaetzt" und kein "ungefaehr".
 *
 *   Das ist der Unterschied zur Bauzeit in recipes.js: die sagt, wie lange
 *   es DAUERN WIRD, wenn man anfaengt. Diese hier sagt, wann es SO WEIT IST.
 *
 * WAS DAS SPIEL NICHT ZEIGT:
 *   Einen fertigen Bau meldet Warframe nur im Orbiter, an der Schmiede. Wer
 *   direkt in eine Mission geht, sieht ihn nie. Beim Abzug, an dem das hier
 *   entwickelt wurde, lagen zwei fertige Gegenstaende seit DREI WOCHEN in der
 *   Schmiede - genau das soll diese Datei sichtbar machen.
 *
 * DER HELMINTH LAEUFT DANEBEN:
 *   Eine Faehigkeit im Helminth ist kein PendingRecipe. Sie steht als
 *   `PendingAbilityRecipe` in `InfestedFoundry`, und ihre Frist ist
 *   `AbilityOverrideUnlockCooldown`. Beide gehoeren hier her: fuer den
 *   Spieler ist es dieselbe Frage - was ist fertig, worauf warte ich noch.
 *   Er wohnt in helminth.js, weil die andere Frage an dasselbe Feld - welche
 *   Warframes sind subsumiert - im Katalog gestellt wird und nicht hier.
 */
import { helminthState, msFrom } from './helminth.js';

/* Wie recipes.js: der Pfad als letzter Ausweg, wenn der Katalog schweigt. */
const shortName = u => String(u).split('/').pop().replace(/([a-z])([A-Z])/g, '$1 $2');

/**
 * Alles, was gerade gebaut wird oder fertig danebenliegt.
 *
 * @param inventory  das abgerufene Inventar (nicht das Profil - PendingRecipes
 *                   steht nur im authentifizierten Abruf)
 * @param catalog    fuer Blaupause -> Ergebnis -> Name. Fehlt er, bleiben die
 *                   Zeiten trotzdem richtig; nur die Namen werden haesslich.
 * @returns {{items, ready, building, nextAt, helminth}}
 */
export function foundryQueue(inventory, catalog = null, now = Date.now()) {
  const items = [];

  for (const row of inventory?.PendingRecipes || []) {
    const recipe = catalog?.recipeByUniqueName?.get(row.ItemType) || null;
    const result = recipe?.resultType || null;
    const item   = result ? catalog?.byUniqueName?.get(result) : null;
    const at     = msFrom(row.CompletionDate);

    items.push({
      /* uniqueName ist das ERGEBNIS, nicht die Blaupause - daran haengen Bild
         und Datenblatt, und darunter kennt der Spieler das Ding. */
      uniqueName: result,
      blueprint: row.ItemType,
      name: item?.name || (result ? shortName(result) : shortName(row.ItemType).replace(/ Blueprint$/, '')),
      /* Ein Bau liefert `num` Stueck - bei Forma eins, bei Munition zwanzig. */
      count: recipe?.num > 0 ? recipe.num : 1,
      /* Die GESAMTdauer dieses Baus. Zusammen mit der Restzeit ergibt sie,
         wie weit er ist - die Fortschrittsanzeige. Sie kommt aus dem Rezept
         und nicht aus einem gemerkten Startzeitpunkt: den gibt es nicht, das
         Inventar fuehrt nur das Ende.

         RUSHEN VERSCHIEBT SIE NICHT: wer mit Platin abkuerzt, hat den Bau
         beendet, nicht verkuerzt - die Zeile ist dann fertig, und der
         Balken spielt keine Rolle mehr. */
      buildSeconds: recipe?.buildTime > 0 ? recipe.buildTime : null,
      completionAt: at,
      /* Ohne Datum lieber "laeuft" als "fertig": eine falsche Fertigmeldung
         schickt jemanden umsonst ins Schiff. */
      ready: at != null && at <= now,
      remainingMs: at == null ? null : Math.max(0, at - now)
    });
  }

  /* Fertiges nach oben, der Rest nach Restzeit - die Reihenfolge, in der man
     die Schmiede abarbeitet. */
  items.sort((a, b) => {
    if (a.ready !== b.ready) return a.ready ? -1 : 1;
    return (a.completionAt ?? Infinity) - (b.completionAt ?? Infinity);
  });

  const ready    = items.filter(i => i.ready);
  const building = items.filter(i => !i.ready);

  const helminth = helminthState(inventory, now);

  /* Der naechste Zeitpunkt, zu dem sich etwas aendert - danach richtet sich,
     wann die Oberflaeche wieder nachsehen muss. Der Helminth zaehlt mit. */
  const kommend = [
    ...building.map(i => i.completionAt),
    helminth?.busy ? helminth.readyAt : null
  ].filter(t => t != null && t > now);

  return {
    items,
    ready,
    building,
    nextAt: kommend.length ? Math.min(...kommend) : null,
    helminth
  };
}

/**
 * Restzeit als Text. Bewusst NICHT formatDuration aus recipes.js:
 *
 * Dort geht es um Bauzeiten am Stueck ("3d 12h"), hier um eine Uhr, die
 * laeuft. Unter einer Stunde ist "0h" die falsche Antwort - dann zaehlen
 * Minuten, und in der letzten Minute die Sekunden.
 */
export function formatRemaining(ms) {
  if (ms == null) return '—';
  if (ms <= 0) return 'ready';

  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);

  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m`;
  return `${s % 60}s`;
}
