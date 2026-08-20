/* Preisschilder im Spiel.

   Bekommt vom Hauptprozess fertige Fensterkoordinaten - die Umrechnung von
   Bildschirmpixeln in Fensterpixel passiert dort, wo die Skalierung des
   Bildschirms bekannt ist.

   Dieses Fenster nimmt nie Eingaben an (setIgnoreMouseEvents im Hauptprozess).
   Es darf unter keinen Umstaenden einen Klick abfangen, der der Karte darunter
   gilt - man waehlt hier eine Belohnung unter Zeitdruck aus. */

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* Ab hier lohnt ein Teil mehr als der uebliche Prime-Schrott. */
const GOOD_PLAT = 20;

function priceText(price) {
  if (price === null || price === undefined) return '…';
  if (!price) return '–';
  return price.min + 'p';
}

function render(tags) {
  const box = $('tags');
  if (!box) return;

  if (!tags || !tags.length) { box.innerHTML = ''; return; }

  /* Das teuerste Teil hervorheben, aber erst wenn alle Preise da sind -
     vorher waere die Auszeichnung eine Behauptung. */
  const prices = tags.map(t => t.price?.min).filter(n => Number.isFinite(n));
  const complete = prices.length === tags.length;
  const best = complete ? Math.max(...prices) : null;

  box.innerHTML = tags.map(t => {
    const good = t.price && t.price.min >= GOOD_PLAT;
    const isBest = t.price && best !== null && t.price.min === best;

    return `
      <div class="tag ${isBest ? 'best' : ''} ${t.isOwn ? 'mine' : ''}"
           style="left:${Math.round(t.cx)}px; top:${Math.round(t.top)}px">
        <div class="tag-price ${good ? 'good' : ''}">${esc(priceText(t.price))}</div>
        <div class="tag-meta">
          <span class="tag-duc">${t.ducats != null ? t.ducats : '–'} D</span>
          ${t.isOwn ? '<span class="tag-mine">deins</span>' : ''}
        </div>
      </div>`;
  }).join('');
}

window.api.onTags(data => render(data && data.tags));
window.api.onTagsHide(() => render([]));
