/**
 * Bedarf gegen Bestand - die Darstellung, einmal fuer alle.
 *
 * Fuenf Stellen zeigen dieselbe Rezeptzeile: die Zielkarten und die
 * Ziel-Details im Planer, die Einkaufsliste, das Item-Fenster und das
 * Overlay. Sie stehen in zwei Dateien und in vier verschiedenen Kaesten,
 * aber sie beantworten dieselbe Frage - und wenn eine davon anders antwortet
 * als die andere, ist die Antwort nichts mehr wert. Deshalb liegt die Regel
 * hier und nicht fuenfmal daneben.
 *
 * DIE DREI ZUSTAENDE:
 *
 *   unbekannt   have === null. Kein Inventar abgerufen. Die Zeile sieht aus
 *               wie vor diesem Feature - eine graue Null waere eine Behauptung
 *               ueber ein Konto, in das wir nie geschaut haben.
 *   genug       Bleibt golden, genau wie bisher. Was reicht, soll nicht
 *               auffallen; auffallen soll, was fehlt.
 *   zu wenig    Ausgegraut, und die Zahl wird zweiteilig: was da ist, vor dem,
 *               was gebraucht wird. Erst das Paar sagt, ob noch zwei Runden
 *               fehlen oder zwanzig.
 *
 * Die Zahlenformatierung kommt von aussen: der Planer schreibt 315.732 aus,
 * im Overlay ist dafuer kein Platz und es heisst 316k. Dieselbe Regel, zwei
 * Schriftgroessen.
 */
const Stock = {
  /** true, sobald ueberhaupt ein Bestand bekannt ist. */
  known(row) {
    return !!row && row.have !== null && row.have !== undefined;
  },

  /** Klassenzusatz fuer das umgebende Kaestchen. */
  cls(row) {
    if (!Stock.known(row)) return '';
    if (row.enough) return 'stock-ok';
    return row.building > 0 ? 'stock-short stock-building' : 'stock-short';
  },

  /**
   * Der Zahlenteil rechts.
   *
   * Bei "zu wenig" steht der eigene Bestand VORNE. Gelesen wird von links,
   * und die Frage beim Blick auf die Zeile lautet "wie weit bin ich", nicht
   * "wie viel war nochmal noetig".
   */
  num(row, fmt) {
    if (!Stock.known(row) || row.enough) return fmt(row.count);
    return `<i class="stock-have">${fmt(row.have)}</i><span class="stock-sep">/</span>${fmt(row.count)}`;
  },

  /**
   * Was im Tooltip steht. Traegt IMMER beide Zahlen, auch wenn genug da ist -
   * dort kostet die Auskunft keinen Platz, und "wie viel habe ich eigentlich"
   * ist eine Frage, die man auch bei einem gruenen Posten hat.
   */
  hint(row, name, fmt) {
    if (!Stock.known(row)) return `${name} ×${fmt(row.count)}`;
    const teile = [`${name}: ${fmt(row.have)} of ${fmt(row.count)}`];
    if (row.building > 0) teile.push(`${fmt(row.building)} in the foundry`);
    else if (!row.enough) teile.push(`${fmt(row.count - row.have)} short`);
    return teile.join(' · ');
  },

  /**
   * Der Schmiede-Punkt. Nur wo Platz ist, und nur wenn er etwas aendert:
   * ein Bauteil, das gerade gebaut wird, ist kein fehlendes Bauteil - es ist
   * eins, das man nicht nochmal farmen muss.
   *
   * ALS <i> UND NICHT ALS <span>: In .mat und .im-mat steht die Regel
   * `span { flex: 1 }` fuer den Namen. Ein span waere von ihr mit erfasst
   * worden und der 6-px-Punkt zu einem blauen Balken quer durch die Zeile
   * auseinandergezogen - so gesehen im Probelauf. <i> traegt in keinem der
   * fuenf Kaesten eine Regel und bleibt deshalb der Punkt, der er sein soll.
   */
  forge(row) {
    if (!Stock.known(row) || row.enough || !(row.building > 0)) return '';
    return '<i class="stock-forge" title="In the foundry"></i>';
  }
};
