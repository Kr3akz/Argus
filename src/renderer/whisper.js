/**
 * Die Handelsnachricht, wie sie ins Spiel gehoert.
 *
 * WAS ARGUS HIER NICHT TUT: sie verschicken. Die Nachricht landet in der
 * Zwischenablage, mehr nicht - eingefuegt und abgeschickt wird sie von Hand,
 * im Spiel. Das ist keine fehlende Bequemlichkeit, sondern die Grenze: ein
 * Programm, das von sich aus fremde Leute anschreibt, ist ein Bot, und zwar
 * auch dann, wenn es freundlich formuliert.
 *
 * DIE RICHTUNG DREHT SICH UM. Eine Order vom Typ "sell" ist ein Angebot des
 * ANDEREN - wer sie anschreibt, will KAUFEN. Andersherum genauso. Die
 * haeufigste Verwechslung an dieser Stelle, und sie faellt erst im Handel
 * auf, wenn beide etwas anderes erwarten.
 *
 * ZUR VORLAGE: Der Satzbau folgt dem, was warframe.market selbst in die
 * Zwischenablage legt - der Empfaenger erkennt ihn wieder und weiss sofort,
 * worum es geht. Das "/w <Name>" stellt die Webseite ebenfalls voran, es
 * gehoert also dazu.
 *
 * Rang und Zustand haengen als Klammer hinter dem Namen. Bei einem Mod ist
 * das kein Beiwerk: Rang 0 und Rang 10 sind verschiedene Waren zu
 * verschiedenen Preisen, und wer das weglaesst, verhandelt aneinander vorbei.
 * Die Zeile steht vor dem Kopieren sichtbar in der Oberflaeche - was
 * abgeschickt wird, hat vorher jemand gelesen.
 */
const Whisper = {
  /**
   * @param offer  eine Zeile aus trade:offers  { type, platinum, rank, subtype, user }
   * @param item   das gesuchte Item            { name }
   * @returns die vollstaendige Zeile fuer den Spielchat
   */
  build(offer, item) {
    if (!offer || !item) return '';

    /* Sein "sell" ist mein "buy" - siehe Kopfkommentar. */
    const richtung = offer.type === 'sell' ? 'buy' : 'sell';

    const zusatz = [];
    if (offer.rank != null) zusatz.push(`rank ${offer.rank}`);
    /* "regular" ist warframe.markets Wort fuer "keine Variante" - bei Mods
       steht es neben Sonderfassungen wie "atragraph". In einer Chatzeile ist
       es Fuellmaterial: niemand schreibt "Serration (regular)", und wer es
       liest, sucht nach der Bedeutung, die es nicht hat. */
    if (offer.subtype && offer.subtype !== 'regular') zusatz.push(String(offer.subtype));
    const klammer = zusatz.length ? ` (${zusatz.join(', ')})` : '';

    return `/w ${offer.user?.name ?? '?'} Hi! I want to ${richtung}: `
         + `"${item.name}"${klammer} for ${offer.platinum} platinum. (warframe.market)`;
  },

  /** Was der Knopf sagt - dieselbe Richtung, kuerzer. */
  label(offer) {
    return offer?.type === 'sell' ? 'Copy buy message' : 'Copy sell message';
  }
};
