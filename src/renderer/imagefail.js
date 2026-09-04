/**
 * Auffangnetz fuer ausgefallene Bilder - fuer das Hauptfenster UND das Overlay.
 *
 * WARUM ES DAS BRAUCHT:
 *   Im Markup standen rund dreissig onerror="this.style.visibility='hidden'".
 *   Kein einziges davon lief jemals: die Content-Security-Policy beider Seiten
 *   erlaubt Skripte nur aus eigenen Dateien, und ein Attribut-Handler zaehlt
 *   als Inline-Skript - der Browser verwirft ihn stillschweigend. Statt eines
 *   versteckten Bildes blieb Chromiums Kaputt-Symbol im Raster stehen. Genau
 *   so sah der Item-Katalog aus.
 *
 *   Dreissig Aufrufstellen einzeln zu verdrahten waere ein grosser Umbau mit
 *   dreissig Gelegenheiten, eine zu vergessen - und die naechste neu
 *   geschriebene Kachel haette den Fehler wieder. Ein Lauscher am Dokument
 *   deckt alles ab, auch was spaeter dazukommt.
 *
 * WARUM CAPTURE:
 *   Das error-Ereignis eines <img> BLUBBERT NICHT. Nach oben kommt es
 *   ausschliesslich in der Capture-Phase - daher das dritte Argument. Ohne das
 *   wuerde hier nie etwas ankommen, und der Fehler saehe aus wie "feuert
 *   nicht" statt "kommt nicht an".
 *
 * WARUM EIN ZWEITER VERSUCH:
 *   Gemessen am Katalog: 600 Kacheln fordern ihre Bilder gleichzeitig an, die
 *   letzte kam nach 86 Sekunden, und zwoelf fielen unterwegs durch - dieselben
 *   Dateien luden danach einzeln anstandslos. Ein Fehlschlag heisst also oft
 *   nicht "gibt es nicht", sondern nur "gerade nicht". Ohne zweiten Versuch
 *   bliebe die Kachel bis zum naechsten Zeichnen leer.
 *
 *   Wirklich fehlende Bilder gibt es auch - die Railjack-Waffen etwa fehlen im
 *   Export vollstaendig. Die kosten so eine zweite Anfrage und sind dann weg.
 *
 * Diese Datei laedt VOR app.js bzw. overlay.js, damit der Lauscher steht,
 * bevor die erste Kachel gezeichnet wird.
 */

/** Was ein endgueltig ausgefallenes Bild hinterlaesst. */
function hideFailedImage(img) {
  /* Ein Ersatzbild, wo die Zeile ohne Bild sinnlos aussaehe - ein Relikt ohne
     sein Symbol ist eine leere Zelle. Nur einmal: zeigt der Ersatz selbst
     nichts, wird nicht im Kreis getauscht. */
  const ersatz = img.dataset.failSrc;
  if (ersatz && img.src !== new URL(ersatz, location.href).href) {
    img.src = ersatz;
    return;
  }

  /* Kleine Symbole in einer Textzeile werden ENTFERNT, nicht nur unsichtbar
     gemacht: eine Luecke mitten im Satz sieht aus wie ein Tippfehler. Alles
     andere behaelt seinen Platz, damit das Raster darum nicht verrutscht -
     dieselbe Unterscheidung, die die alten Attribute schon trafen. */
  const inZeile = img.classList.contains('mat-icon')
               || img.classList.contains('ws-fissure-img');
  if (inZeile) img.style.display = 'none';
  else img.style.visibility = 'hidden';
}

document.addEventListener('error', ev => {
  const img = ev.target;
  if (!(img instanceof HTMLImageElement)) return;

  const src = img.getAttribute('src') || '';
  if (!src || src.startsWith('data:')) return;

  if (img.dataset.imgRetried) { hideFailedImage(img); return; }
  img.dataset.imgRetried = '1';

  /* Der angehaengte Parameter umgeht den Negativ-Cache des Browsers - ohne ihn
     antwortet er sofort wieder mit dem gemerkten Fehlschlag. Die Streuung
     verhindert, dass saemtliche Nachzuegler gemeinsam erneut losrennen und
     denselben Stau noch einmal bauen. */
  setTimeout(() => {
    /* Zwischenzeitlich neu gezeichnet oder ausgetauscht: nicht dazwischenfunken. */
    if (!img.isConnected || img.getAttribute('src') !== src) return;
    img.src = src + (src.includes('?') ? '&' : '?') + 'retry=1';
  }, 300 + Math.random() * 900);
}, true);
