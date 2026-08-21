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

function priceText(price) {
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
            <div class="tag-part-box ${p.isCurrent ? 'current' : ''} ${p.count === 0 ? 'zero' : (!hasEnough ? 'partial' : '')}" title="${esc(p.name)} (${p.count}/${pReq} im Besitz)">
              <img class="tag-part-img" src="${esc(p.image)}" alt="" onerror="this.style.visibility='hidden'">
              <span class="tag-part-qty">${qtyText}</span>
            </div>`;
          }).join('')}
        </div>
      `;
    }

    return `
      <div class="tag ${isBest ? 'best' : ''} ${t.isOwn ? 'mine' : ''}"
           style="left:${Math.round(t.cx)}px; top:${Math.round(t.top)}px">
        
        <div class="tag-header">
          <span class="tag-title">${esc(t.name)}</span>
          ${t.isOwn ? '<span class="tag-mine-badge">DEINS</span>' : ''}
        </div>

        ${badgeHtml}

        ${partsHtml}

        <div class="tag-owned-info">${t.currentOwned ?? 0} / ${t.currentRequired || 1} owned</div>

        <div class="tag-prices-row">
          <div class="tag-price-col tag-plat ${good ? 'good' : ''}">
            <span class="tag-price-val">${esc(priceText(t.price))}</span>
            <img src="assets/icons/currency/platinum.png" class="currency-ic" alt="p">
          </div>
          <div class="tag-price-col tag-duc">
            <span class="tag-duc-val">${t.ducats != null ? t.ducats : '–'}</span>
            <img src="assets/icons/ducats.png" class="currency-ic ducat-ic" alt="D">
          </div>
        </div>

      </div>`;
  }).join('');
}

window.api.onTags(data => render(data && data.tags));
window.api.onTagsHide(() => render([]));
