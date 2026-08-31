/**
 * Der Helminth: was wurde ihm schon vorgeworfen, und was verdaut er gerade.
 *
 * ALLES STEHT IN EINEM FELD: `InfestedFoundry` im abgerufenen Inventar.
 *   ConsumedSuits    jeder Warframe, den der Helminth gefressen hat - und
 *                    damit genau die Liste, deren Faehigkeit man verleihen
 *                    kann. Ein Eintrag ist { s: <uniqueName>, c: {Farben} }.
 *   PendingAbilityRecipe / AbilityOverrideUnlockCooldown
 *                    die Faehigkeit, die gerade laeuft, und ihre Frist.
 *
 * WARUM DAS EINE EIGENE DATEI IST:
 *   Die Frage "welchen Warframe habe ich schon subsumiert" wird an zwei ganz
 *   verschiedenen Stellen gestellt - im Katalog, wo sie eine Kachel
 *   beschriftet, und in der Schmiedeliste, wo sie einen Timer setzt. Beide
 *   sollen dieselbe Antwort bekommen.
 *
 * DIE PFADE PASSEN OHNE UEBERSETZUNG.
 *   ConsumedSuits fuehrt DEs interne Pfade (/Lotus/Powersuits/Wraith/Wraith),
 *   und genau die stehen auch im Katalog als uniqueName - obwohl "Wraith" im
 *   Spiel Sevagoth heisst und "Runner" Gauss. Nachgemessen an einem echten
 *   Abzug: 29 von 29 Eintraegen fanden ihren Katalogeintrag. Es braucht also
 *   KEINE Namenstabelle, und es darf auch keine geben - sie waere genau die
 *   Pflegeliste, die bei jedem neuen Warframe veraltet.
 */

/** Das Datumsformat des Inventars: { $date: { $numberLong: "..." } }. */
export function msFrom(value) {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  const raw = value?.$date?.$numberLong ?? value?.$date ?? value;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Die uniqueNames aller subsumierten Warframes.
 *
 * Als Set, weil die einzige Frage daran "ist der dabei" lautet - und die
 * stellt der Katalog einmal je Kachel, bei 161 Warframes.
 */
export function subsumedSuits(inventory) {
  const out = new Set();
  for (const row of inventory?.InfestedFoundry?.ConsumedSuits || []) {
    if (row?.s) out.add(row.s);
  }
  return out;
}

/* "AtlasPetrifyBlueprint" -> "Atlas Petrify". Notloesung mit Ansage: DEs
   Export enthaelt KEINE Faehigkeitstabelle (nachgezaehlt: 9 Eintraege unter
   /Abilities/, keiner davon ein AbilityOverride). Der Pfad ist die einzige
   Quelle, die den Namen ueberhaupt traegt. */
export function abilityNameFromPath(path = '') {
  return String(path).split('/').pop()
    .replace(/Blueprint$/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim();
}

/**
 * Die Faehigkeit, die gerade im Helminth liegt - oder null.
 *
 * `PendingAbilityRecipe` steht auch dann noch da, wenn die Frist laengst
 * abgelaufen ist: abgeholt wird die Faehigkeit erst im Schiff. "Fertig" ist
 * hier also derselbe Zustand wie bei einem Bau, der auf Abholung wartet.
 */
export function helminthState(inventory, now = Date.now()) {
  const f = inventory?.InfestedFoundry;
  if (!f?.PendingAbilityRecipe) return null;

  const at = msFrom(f.AbilityOverrideUnlockCooldown);
  return {
    ability: abilityNameFromPath(f.PendingAbilityRecipe),
    recipe: f.PendingAbilityRecipe,
    readyAt: at,
    busy: at != null && at > now,
    remainingMs: at == null ? null : Math.max(0, at - now)
  };
}
