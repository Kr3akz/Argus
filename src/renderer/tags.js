/* Preisschilder im Spiel (Argus Relikt-Karten).
   
   Bekommt vom Hauptprozess fertige Fensterkoordinaten und angereicherte Daten:
   - Name & Bild der Belohnung
   - Set-Komponenten mit Inventar-Mengen
   - Gemeistert/Gecraftet-Status
   - Markt-Platinpreis und Dukatenwert */

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* Ab hier lohnt ein Teil mehr als der uebliche Prime-Schrott. */
const GOOD_PLAT = 20;

/**
 * Was in der Platinspalte steht.
 *
 * DREI ZUSTAENDE, NICHT ZWEI. Hier stand einmal nur der Preis gegen null, und
 * der Zweig fuer "kein Preis" war damit unerreichbar: null hiess "laedt noch"
 * und wurde zuerst gefangen. Ein nicht handelbares Teil - Forma - bekam
 * deshalb einen Ladepunkt, der nie wegging.
 *
 * `tradeable: false` heisst: fuer dieses Teil kann es nie einen Preis geben,
 * es steht nicht einmal auf warframe.market. Das ist eine Auskunft und kein
 * Warten, und es soll auch so aussehen.
 */
function priceText(price, tradeable = true) {
  if (!tradeable) return '–';
  if (price === null || price === undefined) return '…';
  if (!price) return '–';
  return price.min;
}

function fmtQty(n) {
  if (n === null || n === undefined) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

function render(tags, panel) {
  const box = $('tags');
  if (!box) return;

  if (!tags || !tags.length || !panel) { box.innerHTML = ''; return; }

  /* Das teuerste Teil hervorheben, aber erst wenn alle Preise da sind -
     vorher waere die Auszeichnung eine Behauptung. Noch ladende Karten zaehlen
     dabei mit: solange eine von ihnen aussteht, kann die teuerste noch kommen.

     GEZAEHLT WIRD NUR, WAS UEBERHAUPT EINEN PREIS HABEN KANN. Vorher stand
     hier `prices.length === tags.length` ueber ALLE Karten. Sass ein Forma
     dabei - nicht handelbar, also nie ein Preis -, konnte das nie aufgehen:
     `complete` blieb dauerhaft falsch, `best` blieb null, und die goldene
     Hervorhebung erschien gar nicht mehr. Nachgezaehlt haben 47 % aller
     Vierer-Bildschirme mindestens ein Forma; in fast jedem zweiten Durchgang
     war der wichtigste Hinweis des Docks damit still abgeschaltet. */
  const bepreisbar = tags.filter(t => t.tradeable !== false);
  const prices = bepreisbar.map(t => t.price?.min).filter(n => Number.isFinite(n));
  const complete = prices.length === bepreisbar.length;
  const best = complete && prices.length ? Math.max(...prices) : null;

  const spalten = tags.map(t => {
    /* Eine Karte, die es noch nicht gibt. Sie haelt ihren Platz, damit das
       Dock nicht bei jeder Nachlieferung neu zurechtrueckt - und sie zeigt,
       dass hier noch etwas kommt, statt eine Luecke zu lassen.
       Der Aufbau ist derselbe wie bei einer echten Karte: Titel, Abzeichen,
       Preisreihe. Nur eben als Balken. Dadurch springt beim Fuellen nichts. */
    if (t.loading) {
      return `
      <div class="tag-card laedt" style="grid-column: ${(t.spalte ?? 0) + 1}">
        <div class="tag-skel tag-skel-title"></div>
        <div class="tag-skel tag-skel-badge"></div>
        <div class="tag-skel tag-skel-prices"></div>
      </div>`;
    }

    const platVal = t.price ? t.price.min : null;
    const good = platVal !== null && platVal >= GOOD_PLAT;
    const isBest = platVal !== null && best !== null && platVal === best;

    // Status-Badge
    let badgeHtml = '';
    const req = t.currentRequired || 1;
    if (t.isCrafted) {
      badgeHtml = `<div class="tag-status-badge crafted"><span class="badge-check">✓</span> Item crafted</div>`;
    } else if (t.currentOwned >= req) {
      badgeHtml = `<div class="tag-status-badge owned">${t.currentOwned} / ${req} owned</div>`;
    } else if (t.currentOwned > 0) {
      badgeHtml = `<div class="tag-status-badge partial">${t.currentOwned} / ${req} owned</div>`;
    } else {
      badgeHtml = `<div class="tag-status-badge missing">0 / ${req} owned</div>`;
    }

    // Set-Komponenten-Reihe
    let partsHtml = '';
    if (t.setParts && t.setParts.length) {
      partsHtml = `
        <div class="tag-parts-row">
          ${t.setParts.map(p => {
            const pReq = p.required || 1;
            const hasEnough = p.count >= pReq;
            const qtyText = pReq > 1 ? `${p.count}/${pReq}` : fmtQty(p.count);
            return `
            <div class="tag-part-box ${p.isCurrent ? 'current' : ''} ${p.count === 0 ? 'zero' : (!hasEnough ? 'partial' : '')}" title="${esc(p.name)} (${p.count}/${pReq} owned)">
              <img class="tag-part-img" src="${esc(p.image)}" alt="" onerror="this.style.visibility='hidden'">
              <span class="tag-part-qty">${qtyText}</span>
            </div>`;
          }).join('')}
        </div>
      `;
    }

    return `
      <div class="tag-card ${isBest ? 'best' : ''} ${t.isOwn ? 'mine' : ''}"
           style="grid-column: ${(t.spalte ?? 0) + 1}">

        ${t.isOwn ? '<span class="tag-mine-badge">YOURS</span>' : ''}

        <div class="tag-title">${esc(t.name)}</div>

        ${badgeHtml}

        ${partsHtml}

        <div class="tag-prices-row">
          <div class="tag-price-col tag-plat ${good ? 'good' : ''}">
            <span class="tag-price-val">${esc(priceText(t.price, t.tradeable !== false))}</span>
            <img src="assets/icons/currency/platinum.png" class="currency-ic" alt="p">
          </div>
          <div class="tag-price-col tag-duc">
            <span class="tag-duc-val">${t.ducats != null ? t.ducats : '–'}</span>
            <img src="assets/icons/ducats.png" class="currency-ic ducat-ic" alt="D">
          </div>
        </div>

      </div>`;
  }).join('');

  /* EIN Dock-Chassis, in dem die einzelnen Cards sitzen, und darunter
     die nahtlose geschwungene Trapez-Lasche mit dem Argus-Signet. */
  /* Steht das Feld schon, darf es NICHT noch einmal einfliegen.
     Die gelesenen Karten werden einzeln nachgereicht, und jede Nachlieferung
     baut das Feld neu auf - mit der Einblendung faengt es dabei jedes Mal bei
     Deckkraft 0 an. Sichtbar war das als kurzes Aufblinken: die Schilder
     standen, waren einen Wimpernschlag weg und dann wieder da. */
  const schonDa = !!box.querySelector('.tag-panel');

  box.innerHTML =
    `<div class="tag-panel${schonDa ? ' schon-da' : ''}" style="left:${Math.round(panel.left)}px;` +
    ` top:${Math.round(panel.top)}px; width:${Math.round(panel.width)}px;` +
    ` grid-template-columns: repeat(${panel.anzahlSpalten}, 1fr)">` +
    spalten +
    /* Die FORM der Lasche steht im Stylesheet als Maske - dieses SVG traegt
       nur noch die Haarlinie. Vorher fuellte es sich selbst, mit einem Ton,
       der nicht der des Docks war; siehe den Kommentar an .tag-panel-fuss. */
    `<div class="tag-panel-fuss">` +
      `<svg class="tag-notch-svg" viewBox="0 0 106 26" aria-hidden="true">` +
        `<path d="M 0 1.5 C 12 1.5 16 23.5 28 23.5 L 78 23.5 C 90 23.5 94 1.5 106 1.5"` +
             ` fill="none" stroke="rgba(255, 255, 255, 0.08)" stroke-width="1" />` +
      `</svg>` +
      `<span class="tag-logo" aria-hidden="true"></span>` +
    `</div>` +
    `</div>`;
}

window.api.onTags(data => render(data && data.tags, data && data.panel));
window.api.onTagsHide(() => render([]));
