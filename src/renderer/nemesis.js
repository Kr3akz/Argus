/**
 * Reiter "Liches & Sisters": die Requiem-Folge mit moeglichst wenigen
 * Stichen finden, und die Requiems geladen halten.
 *
 * WAS HIER STEHT UND WAS NICHT:
 *   Hier wird gezeichnet und geklickt. Gerechnet wird im Hauptprozess
 *   (core/requiem.js), gespeichert im Stichbuch (core/requiem-hunts.js). Jede
 *   Aenderung geht als kleiner Auftrag hin (updateRequiem), zurueck kommt der
 *   ganze neue Stand - dieselbe Form wie getRequiem. So kann die Anzeige nie
 *   etwas anderes rechnen als das, was gespeichert ist.
 *
 * DREI UNTERREITER wie bei den Rivens: die Jagd (Gegner, naechster Stich,
 * Eintragen, was man weiss, die Stiche), der Bestand an Requiems mit dem, was
 * nachzukaufen ist, und die besiegten Gegner.
 *
 * DER ENTWURF (die drei Plaetze unter "Record a stab") steht schon auf dem
 * Vorschlag. Wer ihm folgt, braucht nach dem Stich EINEN Klick: wie weit er
 * kam. Neu befuellt wird er nur, wenn sich am Zug etwas geaendert hat - nicht,
 * wenn im Hintergrund ein Preis nachkommt und der Reiter neu zeichnet.
 */
const Nemesis = (() => {

  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = n => (n ?? 0).toLocaleString('en-GB');

  const ORD = ['1st', '2nd', '3rd'];
  /* Ein neuer Lich braucht drei der acht Requiems - jedes mit 3 zu 8. */
  const NEED_CHANCE = 3 / 8;
  const PLURAL = {
    'Kuva Lich': 'Kuva Liches',
    'Sister of Parvos': 'Sisters of Parvos',
    'Technocyte Coda': 'Technocyte Codas'
  };

  let data = null;
  let loading = null;
  let pane = 'hunt';
  let busy = false;
  let notice = null;

  let draft = [null, null, null];
  let draftSig = null;
  let slotSel = 0;

  /* Zwei Klicks fuer alles, was loescht: der erste macht den Knopf scharf. */
  let armed = null;
  let armedTimer = null;

  /* ------------------------------------------------------------------ */

  const modOf = key => data?.mods.find(m => m.key === key) || null;
  const nameOf = key => modOf(key)?.name || key;
  const chargesOf = key => modOf(key)?.owned?.charges ?? null;

  /* Prozent ohne falsche Gewissheit: 99,6 % sind nicht "100 %". */
  function pct(p) {
    if (p >= 1) return '100%';
    if (p <= 0) return '0%';
    if (p < 0.01) return '<1%';
    return Math.min(99, Math.round(p * 100)) + '%';
  }

  const fmtDate = ms => ms ? new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const fmtShort = ms => ms ? new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

  const glyph = (key, cls = 'nem-glyph') => {
    const m = modOf(key);
    return m?.image
      ? `<img class="${cls}" src="${esc(m.image)}" alt="" draggable="false">`
      : `<span class="${cls} is-blank"></span>`;
  };

  function plural(n, one, many = one + 's') { return `${nf(n)} ${n === 1 ? one : many}`; }

  /* ------------------------------------------------------------------ */
  /* Laden                                                              */
  /* ------------------------------------------------------------------ */

  async function load(force = false) {
    if (data && !force) { render(); return; }
    if (loading) return loading;
    loading = (async () => {
      const res = await window.api.getRequiem();
      loading = null;
      if (res.ok) {
        data = res.data;
        render();
      } else {
        showError(res.error || 'Could not load this tab.');
      }
    })();
    return loading;
  }

  /** Neuer Inventarstand oder neue Preise: beim naechsten Aufschlagen neu holen. */
  function invalidate() {
    if ($('tab-nemesis')?.classList.contains('active')) load(true);
    else data = null;
  }

  async function send(action) {
    if (busy) return;
    busy = true;
    try {
      const res = await window.api.updateRequiem(action);
      if (res.ok) {
        data = res.data;
        notice = null;
      } else {
        notice = res.error || 'Could not save that.';
      }
    } finally {
      busy = false;
      render();
    }
  }

  function showError(text) {
    const box = $('nem-hunt');
    if (box) box.innerHTML = `
      <div class="inv-state">
        <div class="inv-state-icon">${Icon.warning(30)}</div>
        <b>Cannot open this tab right now</b>
        <p>${esc(text)}</p>
      </div>`;
  }

  /* ------------------------------------------------------------------ */
  /* Zeichnen                                                           */
  /* ------------------------------------------------------------------ */

  function render() {
    if (!data) return;
    syncDraft();
    const n = $('nem-notice');
    if (n) {
      n.classList.toggle('hidden', !notice);
      n.innerHTML = notice ? `${Icon.warning(15)}<span>${esc(notice)}</span>` : '';
    }
    $('nem-count-history').textContent = nf(data.history.length);
    renderHunt();
    renderMods();
    renderHistory();
  }

  function showPane(key) {
    pane = key;
    document.querySelectorAll('.nem-pane').forEach(p => p.classList.toggle('active', p.dataset.nemPane === key));
    document.querySelectorAll('#nem-nav .ws-navtab').forEach(t => t.classList.toggle('active', t.dataset.nemGo === key));
  }

  /* ---------------- Entwurf ---------------- */

  /** Der Vorschlag, auf den der Entwurf gesetzt wird: der beste, oder - wenn
      dem etwas fehlt - der beste mit eigenem Bestand. */
  function proposal() {
    const s = data?.solution;
    if (!s?.best) return null;
    if (s.best.missing?.length && s.bestOwned) return s.bestOwned.mods;
    return s.best.mods;
  }

  function syncDraft() {
    const h = data?.hunt;
    const p = proposal();
    const sig = h ? `${h.id}|${h.stabs.length}|${h.hints.join(',')}|${data.prefs.allowOull}|${p ? p.join(',') : ''}` : null;
    if (sig === draftSig) return;
    draftSig = sig;
    draft = p ? [...p] : [null, null, null];
    slotSel = Math.max(0, draft.indexOf(null));
  }

  /* ---------------- Jagd ---------------- */

  function renderHunt() {
    const box = $('nem-hunt');
    if (!box) return;
    const d = data;
    let html = foeHtml();

    if (!d.hunt) {
      html += emptyHtml();
    } else {
      html += `
        <div class="nem-cols">
          <div class="nem-col">${nextHtml()}${d.solution?.done ? afterHtml() : recordHtml()}</div>
          <div class="nem-col">${boardHtml()}${logHtml()}</div>
        </div>`;
    }
    box.innerHTML = html;
  }

  function fact(k, v) {
    return `<div class="nem-fact"><span>${esc(k)}</span><b>${v}</b></div>`;
  }

  /** Der Ring unter "Known Requiems" im Spiel, im Kleinen. */
  function murmurFact(m) {
    const r = 6, c = 2 * Math.PI * r;
    const fill = m.share > 0
      ? `<circle cx="8" cy="8" r="${r}" class="is-fill" stroke-dasharray="${(m.share * c).toFixed(2)} ${c.toFixed(2)}"/>`
      : '';
    const tip = `From your inventory: ${m.progress} of ${m.step} murmur points - the ring under Known Requiems in the game. `
      + `When it is full, a murmur names another requiem of the sequence (${m.known} of 3 known).`;
    return `
      <div class="nem-fact" title="${esc(tip)}">
        <span>Next murmur</span>
        <b><svg class="nem-ring" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="${r}"/>${fill}</svg>${pct(m.share)}</b>
      </div>`;
  }

  /** Der Gegner: aus dem Inventar, oder ein Zug von Hand. */
  function foeHtml() {
    const d = data;
    const n = d.nemesis;
    if (n) {
      const terr = n.nodes.length
        ? `${esc(n.planets.join(', ') || 'Unknown')} · ${plural(n.nodes.length, 'node')}`
        : null;
      const nodes = n.nodes.length ? `
        <div class="nem-nodes">${n.nodes.map(x =>
          `<span class="nem-node" title="${esc(x.node)}">${esc(String(x.name).replace(/\s*\([^)]*\)\s*$/, ''))}${x.type ? `<i>${esc(x.type)}</i>` : ''}</span>`).join('')}
        </div>` : '';
      return `
        <div class="nem-foe fac-${esc((n.faction || 'none').toLowerCase())}">
          <div class="nem-foe-art">${n.progenitor ? `<img src="${esc(n.progenitor.image)}" alt="">` : ''}</div>
          <div class="nem-foe-main">
            <div class="nem-foe-top">
              <b>${n.name ? esc(n.name) : `Your ${esc(n.label)}`}</b>
              ${n.name ? `<span class="trade-chip chip-neutral">${esc(n.label)}</span>` : ''}
              ${n.traded ? '<span class="trade-chip chip-neutral">Traded</span>' : ''}
              ${d.inventory ? `<span class="nem-asof">as of ${esc(fmtShort(d.inventory.syncedAt || d.inventory.fetchedAt))}</span>` : ''}
            </div>
            <div class="nem-facts">
              ${n.progenitor ? fact('Progenitor', esc(n.progenitor.name)) : ''}
              ${n.level ? fact('Level', `${n.level}<small> of 5</small>`) : ''}
              ${terr ? fact('Territory', terr) : ''}
              ${n.minions && n.minionsKilled != null ? fact(`${n.minions} defeated`, nf(n.minionsKilled)) : ''}
              ${n.murmur && !d.solution?.done ? murmurFact(n.murmur) : ''}
              ${n.createdAt ? fact('Hunting since', esc(fmtDate(n.createdAt))) : ''}
            </div>
            ${nodes}
          </div>
        </div>`;
    }
    const h = d.hunt;
    if (h && h.source === 'manual') {
      const label = h.kind === 'sister' ? 'Sister of Parvos' : 'Kuva Lich';
      return `
        <div class="nem-foe fac-${h.kind === 'sister' ? 'corpus' : 'grineer'} is-manual">
          <div class="nem-foe-main">
            <div class="nem-foe-top">
              <b>Your ${label}</b>
              <span class="trade-chip chip-neutral">Tracked by hand</span>
            </div>
            <div class="nem-facts">
              ${h.startedAt ? fact('Tracking since', esc(fmtDate(h.startedAt))) : ''}
              ${fact('Stabs logged', nf(h.stabs.length))}
            </div>
          </div>
          <div class="nem-foe-actions">
            <button class="btn-sm" data-nem-finish="${esc(h.id)}">${Icon.check(13)}<span>End this hunt</span></button>
            <button class="btn-sm danger" data-nem-delete="${esc(h.id)}">${Icon.trash(13)}<span>${armed === 'del:' + h.id ? 'Delete for good?' : 'Delete'}</span></button>
          </div>
        </div>`;
    }
    return '';
  }

  /** Kein Zug: warum, und der Weg von Hand. */
  function emptyHtml() {
    const d = data;
    const n = d.nemesis;
    if (n && !n.requiems) {
      return `
        <div class="nem-note">
          ${Icon.warning(15)}
          <span>A ${esc(n.label)} is weakened with antivirus mods, not with a requiem sequence -
          there is nothing to work out here. Your antivirus mods and their charges are under
          <button class="linkish" data-nem-go-pane="mods">Requiem mods</button>.</span>
        </div>`;
    }
    const why = d.invState
      ? (d.invState.code === 'empty'
        ? 'Argus has not read your inventory yet, so it cannot see your adversary.'
        : d.invState.error)
      : `Your last inventory${d.inventory ? ` (as of ${fmtShort(d.inventory.syncedAt || d.inventory.fetchedAt)})` : ''} shows no active Kuva Lich or Sister of Parvos.`;
    return `
      <div class="nem-empty">
        <span class="nem-empty-ic">${Icon.requiem(34)}</span>
        <b>No hunt running</b>
        <p>${esc(why)} Fetch the inventory once your adversary exists, or track it by hand -
        everything here works the same either way, also on console.</p>
        <div class="nem-empty-actions">
          <button class="btn" data-nem-start="lich">Track a Kuva Lich</button>
          <button class="btn" data-nem-start="sister">Track a Sister of Parvos</button>
        </div>
      </div>`;
  }

  function slotsHtml(mods, { compact = false } = {}) {
    return `<div class="nem-seq${compact ? ' is-compact' : ''}">${mods.map((k, i) => {
      const empty = k !== 'oull' && chargesOf(k) === 0;
      return `
        <div class="nem-seq-slot${k === 'oull' ? ' is-oull' : ''}${empty ? ' is-empty' : ''}">
          <span class="nem-ord">${ORD[i]}</span>
          ${glyph(k)}
          <b>${esc(nameOf(k))}</b>
          ${empty ? '<span class="nem-flag">No charges</span>' : ''}
        </div>`;
    }).join('')}</div>`;
  }

  /** Der naechste Stich - oder warum es keinen gibt. */
  function nextHtml() {
    const s = data.solution;
    if (!s) return '';

    if (s.contradiction) {
      const parts = [];
      if (s.suspects.stabs.length) parts.push(`stab ${s.suspects.stabs.map(i => '#' + (i + 1)).join(' or ')}`);
      if (s.suspects.hints.length) parts.push(`the murmur ${s.suspects.hints.map(nameOf).join(' or ')}`);
      return `
        <div class="nem-next is-error">
          <div class="nem-head"><span class="nem-k">Nothing fits</span></div>
          <p class="nem-text">No sequence matches everything you entered - usually one stab was logged with the
          wrong slot. ${parts.length ? `Check ${esc(parts.join(', or '))}: without it, it all fits again.` : 'Check the latest entries.'}</p>
        </div>`;
    }

    if (s.done) {
      /* Die Folge kann fehlen: das Spiel fuehrt den Lich als geschwaecht,
         ohne dass Argus den gelungenen Stich gesehen hat (siehe
         resolveGuesses). Dann zaehlt nur, DASS es geklappt hat. */
      const mods = s.finalMods;
      const oull = !!mods?.includes('oull');
      const next = data.hunt.source === 'manual'
        ? 'When you are done with the final fight, end this hunt and it moves to your past hunts.'
        : 'Vanquish or convert it in the final fight; once your inventory shows it as defeated, it moves to your past hunts.';
      return `
        <div class="nem-next is-done">
          <div class="nem-head"><span class="nem-k">Sequence found</span><span class="nem-chance">${Icon.check(14)} it worked</span></div>
          ${mods ? slotsHtml(mods) : ''}
          <p class="nem-text">${mods
            ? `Each of these requiems lost one charge with that stab${oull ? ' - Oull too' : ''}.`
            : 'Your inventory shows your Lich as weakened - the right sequence went in. Argus did not see which stab it was, so the requiems are not listed here.'}
          ${s.weakened || data.nemesis?.weakened ? 'The game says so itself, no need to log it. ' : ''}${next}</p>
        </div>`;
    }

    const b = s.best;
    if (!b) return '';
    const o = s.outlook;
    const sure = b.chance >= 1;
    const outlook = o && Number.isFinite(o.expected)
      ? (o.worst <= 1 ? 'This stab ends it.' : `At most ${plural(o.worst, 'stab')} from here, about ${o.expected.toFixed(1)} on average.`)
      : '';

    let extra = '';
    if (b.usesOull) {
      extra += sure
        ? `<p class="nem-text is-soft">Oull stands in for the requiem you have not found yet - it loses a charge with this stab, like the other two. Turn off "Use Oull in suggestions" to find that one by hand instead.</p>`
        : `<p class="nem-text is-soft">Oull fits any slot, so this stab can test the requiems behind it. It only loses a charge if the stab works.</p>`;
    }
    if (b.missing?.length) {
      const names = b.missing.map(nameOf).join(' and ');
      extra += `<div class="nem-warn">${Icon.warning(14)}<span>You have no charges on ${esc(names)}.
        ${s.bestOwned
          ? (s.bestOwned.chance > 0
            ? `With what you own, the best stab is below - ${pct(s.bestOwned.chance)} to work.`
            : 'With what you own, no stab can work yet - but this one still narrows it down:')
          : 'Get one before you stab.'}</span></div>`;
      if (s.bestOwned) extra += `<div class="nem-alt">${slotsHtml(s.bestOwned.mods, { compact: true })}
          <button class="btn-sm" data-nem-use="owned">Use this</button></div>`;
    }
    if (s.oullOutlook) {
      extra += `<p class="nem-text is-soft">${data.prefs.allowOull ? 'An Oull' : 'Allowing Oull'} would bring this down to about
        ${s.oullOutlook.expected.toFixed(1)} stabs (at most ${s.oullOutlook.worst}).</p>`;
    }

    return `
      <div class="nem-next">
        <div class="nem-head">
          <span class="nem-k">${sure ? 'Final stab' : 'Next stab'}</span>
          <span class="nem-chance">${sure ? 'This is the sequence' : `${pct(b.chance)} chance this is it`}</span>
        </div>
        ${slotsHtml(b.mods)}
        ${outlook ? `<p class="nem-text">${esc(outlook)}${sure ? spendHint(b.mods) : ''}</p>` : ''}
        ${extra}
      </div>`;
  }

  /** Nach dem Erfolg steht unter der Folge, was fuer den naechsten Gegner fehlt. */
  function afterHtml() {
    const list = data.mods.some(m => m.owned) ? restockList().slice(0, 4) : [];
    const rows = list.map(({ m, why }) => `
      <div class="nem-rs is-compact">
        ${glyph(m.key)}
        <div><b>${esc(m.name)}</b><span>${esc(why)}</span></div>
        ${priceHtml(m)}
      </div>`).join('');
    return `
      <div class="nem-panel nem-after">
        <div class="nem-head">
          <span class="nem-k">Before your next hunt</span>
          <button class="linkish" data-nem-go-pane="mods">All requiem mods</button>
        </div>
        ${rows
          ? `<div class="nem-restock">${rows}</div>
             <p class="nem-text is-soft">Charges as of your last inventory - the stab you just logged is not in it until the next fetch.</p>`
          : `<p class="nem-text is-soft">${data.mods.some(m => m.owned)
              ? 'Every requiem has two charges or more - you are set for the next one.'
              : 'Fetch your inventory to see which requiems are running low.'}</p>`}
      </div>`;
  }

  /** Beim letzten Stich: welches Exemplar man einsteckt. */
  function spendHint(mods) {
    const part = mods.filter(k => k !== 'oull').map(k => {
      const o = modOf(k)?.owned;
      return o && o.usable > 1 && o.spendFirst < 3 ? `${nameOf(k)} with ${o.spendFirst} charge${o.spendFirst === 1 ? '' : 's'} left` : null;
    }).filter(Boolean);
    return part.length ? ` Equip your used copies first (${esc(part.join(', '))}) - full ones trade better.` : '';
  }

  /** Eintragen, wie ein Stich ausging. */
  function recordHtml() {
    const ready = draft.every(Boolean) && new Set(draft).size === 3;
    const slots = draft.map((k, i) => `
      <button class="nem-dslot${slotSel === i ? ' is-sel' : ''}${k ? '' : ' is-blank'}" data-dslot="${i}">
        <span class="nem-ord">${ORD[i]}</span>
        ${k ? glyph(k) : '<span class="nem-glyph is-blank"></span>'}
        <b>${k ? esc(nameOf(k)) : 'Pick a requiem'}</b>
      </button>`).join('');
    const palette = data.mods.map(m => {
      const ch = m.owned?.charges;
      const used = draft.indexOf(m.key);
      return `
        <button class="nem-pal${used >= 0 ? ' is-used' : ''}${ch === 0 ? ' is-empty' : ''}${m.key === 'oull' ? ' is-oull' : ''}"
                data-pal="${esc(m.key)}"
                title="${esc(m.name + (ch == null ? '' : ` · ${ch} charge${ch === 1 ? '' : 's'}`) + (m.key === 'oull' ? ' · fits every slot' : ''))}">
          ${glyph(m.key)}
          <span>${esc(m.name)}</span>
          ${used >= 0 ? `<i class="nem-pal-pos">${used + 1}</i>` : ''}
        </button>`;
    }).join('');
    const res = [0, 1, 2].map(i => `
      <button class="btn-sm nem-res" data-res="${i}" ${ready && draft[i] !== 'oull' ? '' : 'disabled'}
              title="${draft[i] === 'oull' ? 'Oull never fails' : `The ${ORD[i]} requiem was wrong${i ? ', everything before it was right' : ''}`}">
        ${Icon.cross(12)}<span>Failed on ${ORD[i]}</span>
      </button>`).join('');
    return `
      <div class="nem-panel nem-record">
        <div class="nem-head">
          <span class="nem-k">Record a stab</span>
          <span class="hint">The game checks left to right and stops at the first wrong requiem</span>
        </div>
        <div class="nem-draft">${slots}</div>
        <div class="nem-palette">${palette}</div>
        <div class="nem-results">
          ${res}
          <button class="btn btn-primary nem-res-ok" data-res="3" ${ready ? '' : 'disabled'} title="All three were right. Your inventory shows it too once you are back on your ship - logging it here just shows it sooner.">${Icon.check(14)}<span>It worked</span></button>
        </div>
      </div>`;
  }

  /** Was man weiss: je Requiem und Platz die Wahrscheinlichkeit. */
  function boardHtml() {
    const s = data.solution;
    const hints = new Set(data.hunt.hints);
    /* Was das Spiel als Murmur fuehrt, steht fest - der Knopf zeigt es nur. */
    const fromGame = new Set(data.hunt.gameHints || []);
    const rows = data.mods.filter(m => m.key !== 'oull').map(m => {
      const inSeq = s?.inSequence?.[m.key] ?? 0;
      const cells = [0, 1, 2].map(i => {
        const p = s?.slots?.[i]?.[m.key] ?? 0;
        const cls = p >= 1 ? ' is-sure' : p <= 0 ? ' is-out' : '';
        return `<span class="nem-p${cls}" style="--p:${p.toFixed(3)}">${p >= 1 ? Icon.check(12) : p <= 0 ? '–' : pct(p)}</span>`;
      }).join('');
      const ch = m.owned?.charges;
      return `
        <div class="nem-row${inSeq >= 1 ? ' is-in' : ''}${inSeq <= 0 && !s?.contradiction ? ' is-gone' : ''}">
          <span class="nem-rq">${glyph(m.key)}<b>${esc(m.name)}</b></span>
          <button class="nem-murmur${hints.has(m.key) ? ' is-on' : ''}${fromGame.has(m.key) ? ' is-game' : ''}" data-hint="${esc(m.key)}"
                  ${fromGame.has(m.key) ? 'disabled' : ''}
                  title="${fromGame.has(m.key) ? 'Known from your inventory - a murmur named it, or a stab found it'
                         : hints.has(m.key) ? 'Marked by hand - click to undo. Your inventory takes over once it has the murmur too.'
                         : 'Mark as revealed by a murmur'}">
            ${hints.has(m.key) ? Icon.check(11) + '<span>Known</span>' : '<span>Known?</span>'}
          </button>
          ${cells}
          <span class="nem-ch${ch === 0 ? ' is-zero' : ''}" title="Charges you have">${ch == null ? '' : nf(ch)}</span>
        </div>`;
    }).join('');
    return `
      <div class="nem-panel nem-board">
        <div class="nem-head">
          <span class="nem-k">What you know</span>
          <span class="nem-count">${!s || s.contradiction ? '' : s.done ? 'Solved' : `${nf(s.count)} of ${nf(s.total)} sequences left`}</span>
        </div>
        <div class="nem-grid">
          <div class="nem-row is-head">
            <span>Requiem</span><span>Murmur</span><span>${ORD[0]}</span><span>${ORD[1]}</span><span>${ORD[2]}</span><span title="Charges you have">Ch.</span>
          </div>
          ${rows}
        </div>
        <div class="nem-board-foot">
          <button class="filter-chip${data.prefs.allowOull ? ' active' : ''}" data-nem-oull aria-pressed="${data.prefs.allowOull}">Use Oull in suggestions</button>
          <span class="hint">Murmurs name the requiems, never their slot. Argus takes them from your inventory - mark one by hand to use it before your next fetch.</span>
        </div>
      </div>`;
  }

  /** Eine Zeile im Verlauf - aus dem Spiel, von Hand, oder ausgegraut. */
  function stabRow(st, n, { suspect = false, stale = false } = {}) {
    const read = Number.isInteger(st.result);
    const marks = st.mods.map((k, j) => {
      const state = !read ? 'skip' : st.result === 3 || j < st.result ? 'ok' : j === st.result ? 'bad' : 'skip';
      const word = !read ? 'not readable yet' : state === 'ok' ? 'right' : state === 'bad' ? 'wrong' : 'not tested';
      return `<span class="nem-mini is-${state}" title="${esc(`${nameOf(k)}: ${word}`)}">${glyph(k, 'nem-mini-img')}</span>`;
    }).join('');
    const text = !read ? 'Not readable yet' : st.result === 3 ? 'It worked' : `Failed on ${ORD[st.result]}`;

    /* Woher der Eintrag kommt, in einem Wort. Ein Stich aus dem Spiel ist
       nicht loeschbar - er steht im Lich-Profil; loeschen laesst sich nur,
       was hier eingetragen wurde und noch nicht im Inventar steht. */
    let src = '', srcTip = '';
    if (stale) { src = 'Not in game'; srcTip = 'Logged here, but your inventory does not have this stab - it is not counted. Check the requiems and remove it.'; }
    else if (st.source === 'game') {
      src = 'Game';
      srcTip = st.unread
        ? 'Your inventory has this stab, but Argus cannot read yet how far it got. Log it here with the same requiems and it counts.'
        : st.corrected ? 'From your inventory - it says otherwise than what was logged here, and the game wins.'
        : 'From your inventory, as the Lich profile shows it';
    } else if (data.hunt.fromGame) { src = 'Logged'; srcTip = 'Logged here - your next inventory fetch confirms it'; }

    const canRemove = st.source !== 'game' && Number.isInteger(st.bookIndex);
    const key = 'stab:' + st.bookIndex;
    return `
      <div class="nem-stab${suspect ? ' is-suspect' : ''}${read && st.result === 3 ? ' is-win' : ''}${stale || st.unread ? ' is-stale' : ''}">
        <span class="nem-stab-n">${n}</span>
        <span class="nem-stab-mods">${marks}</span>
        <span class="nem-stab-names">${st.mods.map(k => esc(nameOf(k))).join(' · ')}</span>
        <span class="nem-stab-res">${text}${src ? ` <i class="nem-src${st.source === 'game' ? ' is-game' : ''}" title="${esc(srcTip)}">${esc(src)}</i>` : ''}</span>
        <span class="nem-stab-at">${esc(fmtShort(st.at))}</span>
        ${canRemove
          ? `<button class="nem-x" data-remove="${st.bookIndex}" title="Remove this stab">${armed === key ? 'Remove?' : Icon.close(12)}</button>`
          : '<span></span>'}
      </div>`;
  }

  /** Die Stiche bisher, neueste unten - so, wie man sie gemacht hat. */
  function logHtml() {
    const h = data.hunt;
    const sus = new Set(data.solution?.contradiction ? data.solution.suspects.stabs : []);
    const rows = h.stabs.map((st, i) => stabRow(st, `#${i + 1}`, { suspect: sus.has(i) })).join('');
    const stale = (h.stale || []).map(st => stabRow(st, '–', { stale: true })).join('');
    return `
      <div class="nem-panel nem-log">
        <div class="nem-head"><span class="nem-k">Stabs so far</span><span class="nem-count">${nf(h.stabs.length)}</span></div>
        ${rows || '<p class="nem-text is-soft">Nothing yet. After each stab, put in what you equipped and how far it got - Argus keeps the log and works out the next one.</p>'}
        ${stale}
        ${h.fromGame ? '<p class="nem-text is-soft">Stabs marked <b>Game</b> come straight from your inventory. What you log here counts until the next inventory fetch confirms it.</p>' : ''}
      </div>`;
  }

  /* ---------------- Requiem-Mods ---------------- */

  /** Was nachzukaufen ist, wichtigstes zuerst. */
  function restockList() {
    const s = data.solution;
    const out = [];
    for (const m of data.mods) {
      if (m.key === 'oull' || !m.owned) continue;
      const ch = m.owned.charges;
      const inSeq = s && !s.done && !s.contradiction ? (s.inSequence?.[m.key] ?? 0) : 0;
      let rank, why;
      if (ch === 0 && inSeq >= 1) { rank = 0; why = 'In your current sequence, and you have no charges on it.'; }
      else if (ch === 0 && inSeq > 0) { rank = 1; why = `${pct(inSeq)} likely to be in your current sequence, and you have no charges on it.`; }
      else if (ch === 0) { rank = 2; why = `No charges - each new adversary needs it with a ${Math.round(NEED_CHANCE * 100)}% chance.`; }
      else if (ch === 1) { rank = 3; why = 'One charge left - enough for one more adversary.'; }
      else continue;
      out.push({ m, rank, why });
    }
    return out.sort((a, b) => a.rank - b.rank || a.m.owned.charges - b.m.owned.charges);
  }

  function priceHtml(m) {
    if (!m.price || (m.price.median == null && m.price.min == null)) return '';
    const v = m.price.median ?? m.price.min;
    return `<span class="nem-price${m.price.stale ? ' is-stale' : ''}" title="warframe.market, a fresh copy (rank 0, 3 charges)${m.price.stale ? ' - older price' : ''}">${nf(v)}p</span>`;
  }

  /* Das Relikt mit der besten Chance zuerst - Requiem I vor Eterna. */
  function sourcesFor(key) {
    return [...(data.relicSources?.[key] || [])].sort((a, b) => (b.chance || 0) - (a.chance || 0)).map(x => x.relic);
  }

  /* Auch hier das Relikt mit der besten Chance zuerst. */
  function ownedRelicFor(key) {
    const chance = r => r.requiems.find(q => q.key === key)?.chance || 0;
    return (data.relics || []).filter(r => chance(r) > 0).sort((a, b) => chance(b) - chance(a));
  }

  function renderMods() {
    const box = $('nem-mods');
    if (!box) return;
    const d = data;
    const req = d.mods.filter(m => m.key !== 'oull');
    const oull = modOf('oull');

    const head = d.stock ? `
      <div class="nem-stats">
        <div class="nem-stat"><b>${nf(d.stock.guaranteed)}</b><span>more ${d.stock.guaranteed === 1 ? 'Lich or Sister' : 'Liches or Sisters'} your charges finish for sure, whatever the sequence</span></div>
        <div class="nem-stat"><b>${nf(req.reduce((s, m) => s + (m.owned?.charges || 0), 0))}</b><span>charges on the eight requiems</span></div>
        <div class="nem-stat"><b>${nf(oull?.owned?.charges || 0)}</b><span>Oull charges - each stands in for one requiem</span></div>
        <div class="nem-stat"><b>${nf(d.stock.defiled)}</b><span>defiled - any ${d.stock.transmuteCount} requiems transmute into a fresh one</span></div>
      </div>` : `
      <div class="nem-note">${Icon.warning(15)}<span>Fetch your inventory to see your charges. Prices and where each requiem drops are below either way.</span></div>`;

    const restock = d.stock ? restockList() : [];
    const restockHtml = restock.length ? `
      <h3 class="riven-subhead">Restock first</h3>
      <div class="nem-restock">${restock.map(({ m, rank, why }) => {
        const owned = ownedRelicFor(m.key);
        const via = [
          priceHtml(m) ? `${priceHtml(m)} on warframe.market` : '',
          owned.length ? `crack ${owned.map(r => `<b>${esc(r.key)}</b> ×${nf(r.count)}`).join(', ')} you own` : ''
        ].filter(Boolean).join(' · ');
        return `
          <div class="nem-rs${rank <= 1 ? ' is-urgent' : ''}">
            ${glyph(m.key)}
            <div><b>${esc(m.name)}</b><span>${esc(why)}</span></div>
            <span class="nem-rs-via">${via || esc(sourcesFor(m.key).join(', '))}</span>
          </div>`;
      }).join('')}</div>` : '';

    const cards = d.mods.map(m => {
      const o = m.owned;
      const status = !o ? '' : o.charges === 0 ? 'is-zero' : o.charges === 1 ? 'is-low' : 'is-ok';
      const chip = !o ? '' : o.charges === 0
        ? '<span class="trade-chip chip-vault">Empty</span>'
        : o.charges === 1 ? '<span class="trade-chip chip-setneed">Low</span>' : '<span class="trade-chip chip-junk">Ready</span>';
      const pips = !o ? '' : o.copies.length
        ? o.copies.map(c => `<span class="nem-copy" title="${c ? `${c} of 3 charges` : 'Defiled - transmute or dissolve'}">${[0, 1, 2].map(i => `<i class="${i < c ? 'on' : ''}"></i>`).join('')}</span>`).join('')
        : '<span class="nem-none">None owned</span>';
      const src = m.key === 'oull' ? 'Drops when your adversary flees after the right sequence' : sourcesFor(m.key).join(' · ');
      return `
        <div class="nem-mod ${status}${m.key === 'oull' ? ' is-oull' : ''}">
          <div class="nem-mod-top">
            ${glyph(m.key)}
            <div class="nem-mod-title"><b>${esc(m.name)}</b><span title="${esc(src)}">${esc(src)}</span></div>
            ${chip}
          </div>
          <div class="nem-copies">${pips}</div>
          <div class="nem-mod-foot">
            <span>${o ? plural(o.charges, 'charge') : ''}${o && o.defiled ? ` · ${nf(o.defiled)} defiled` : ''}</span>
            ${priceHtml(m)}
          </div>
        </div>`;
    }).join('');

    const relics = d.relics?.length ? `
      <h3 class="riven-subhead">Requiem relics you own</h3>
      <div class="nem-relics">${d.relics.map(r => `
        <div class="nem-relic">
          ${r.image ? `<img src="${esc(r.image)}" alt="">` : ''}
          <div><b>${esc(r.key)} <small>×${nf(r.count)}</small></b>
          <span>${r.requiems.map(q => `${esc(nameOf(q.key))}${q.chance ? ` ${q.chance}%` : ''}`).join(' · ') || 'No requiem in this relic'}</span></div>
        </div>`).join('')}</div>` : '';

    const av = d.antivirus?.some(a => a.copies.length) ? `
      <h3 class="riven-subhead">Antivirus mods <small>for the Technocyte Coda</small></h3>
      <div class="nem-avgrid">${d.antivirus.map(a => `
        <div class="nem-av${a.charges === 0 ? ' is-zero' : ''}">
          ${a.image ? `<img class="nem-glyph" src="${esc(a.image)}" alt="">` : ''}
          <b>${esc(a.name)}</b>
          <span>${a.copies.length ? plural(a.charges, 'charge') : 'None'}</span>
        </div>`).join('')}</div>` : '';

    box.innerHTML = head + restockHtml
      + `<h3 class="riven-subhead">Your requiems</h3><div class="nem-modgrid">${cards}</div>`
      + relics + av;
  }

  /* ---------------- Geschichte ---------------- */

  function renderHistory() {
    const box = $('nem-history');
    if (!box) return;
    const list = data.history;
    if (!list.length) {
      box.innerHTML = `<p class="hint">${data.inventory ? 'No defeated adversaries in your inventory yet.' : 'Your defeated adversaries show up here once the inventory has been fetched.'}</p>`;
      return;
    }
    const counts = new Map();
    for (const h of list) counts.set(h.label, (counts.get(h.label) || 0) + 1);
    const totals = [...counts].sort((a, b) => b[1] - a[1]).map(([label, n]) =>
      `<span class="nem-total"><b>${nf(n)}</b> ${esc(n === 1 ? label : PLURAL[label] || label)}</span>`).join('');

    box.innerHTML = `
      <div class="nem-totals">${totals}</div>
      <div class="nem-past-list">${list.map(h => {
        const t = h.hunt;
        const seq = t?.sequence ? `<span class="nem-stab-mods">${t.sequence.map(k => `<span class="nem-mini is-ok">${glyph(k, 'nem-mini-img')}</span>`).join('')}</span>` : '';
        const tracked = t
          ? `${seq}<span>${plural(t.stabs, 'stab')} logged${t.failed ? `, ${nf(t.failed)} failed` : ''}</span>`
          : '<span class="is-soft">Not tracked in Argus</span>';
        return `
          <div class="nem-past fac-${esc((h.faction || (h.kind === 'sister' ? 'corpus' : h.kind === 'coda' ? 'infested' : 'grineer')).toLowerCase())}">
            <div class="nem-past-art">${h.progenitor ? `<img src="${esc(h.progenitor.image)}" alt="">` : ''}</div>
            <div class="nem-past-main">
              <b>${esc(h.name || h.label)}</b>
              <span>${[h.name ? h.label : null, h.createdAt ? fmtDate(h.createdAt) : null, h.progenitor ? `Progenitor ${h.progenitor.name}` : null, h.manual ? 'tracked by hand' : null].filter(Boolean).map(esc).join(' · ')}</span>
            </div>
            ${h.level ? `<span class="nem-past-level" title="The level it had at the end">Level ${h.level}</span>` : '<span></span>'}
            <div class="nem-past-hunt">${tracked}</div>
          </div>`;
      }).join('')}</div>`;
  }

  /* ------------------------------------------------------------------ */
  /* Bedienung                                                          */
  /* ------------------------------------------------------------------ */

  function arm(key) {
    clearTimeout(armedTimer);
    armed = key;
    armedTimer = setTimeout(() => { armed = null; render(); }, 3000);
    render();
  }

  function pick(key) {
    const i = slotSel;
    const j = draft.indexOf(key);
    if (j === i) {
      draft[i] = null;
    } else {
      /* Steht das Requiem schon auf einem anderen Platz, tauschen die beiden -
         jedes Requiem passt nur einmal in den Parazon. */
      if (j >= 0) draft[j] = draft[i];
      draft[i] = key;
      const next = [1, 2, 3].map(d => (i + d) % 3).find(x => !draft[x]);
      slotSel = next ?? (i + 1) % 3;
    }
    renderHunt();
  }

  function useProposal(which) {
    const s = data?.solution;
    const mods = which === 'owned' ? s?.bestOwned?.mods : s?.best?.mods;
    if (!mods) return;
    draft = [...mods];
    slotSel = 0;
    renderHunt();
  }

  function onClick(e) {
    const t = e.target.closest('button');
    if (!t || busy || !data) return;
    const h = data.hunt;

    if (t.dataset.nemGo) { showPane(t.dataset.nemGo); return; }
    if (t.dataset.nemGoPane) { showPane(t.dataset.nemGoPane); return; }
    if (t.dataset.dslot != null) { slotSel = Number(t.dataset.dslot); renderHunt(); return; }
    if (t.dataset.pal) { pick(t.dataset.pal); return; }
    if (t.dataset.nemUse) { useProposal(t.dataset.nemUse); return; }

    if (t.dataset.res != null && h) {
      send({ op: 'record', id: h.id, mods: [...draft], result: Number(t.dataset.res) });
      return;
    }
    if (t.dataset.hint && h) {
      /* Gespeichert werden nur die von Hand markierten - was das Spiel
         fuehrt, kommt bei jedem Abruf ohnehin wieder. */
      const game = new Set(h.gameHints || []);
      if (game.has(t.dataset.hint)) return;
      const set = new Set(h.hints.filter(k => !game.has(k)));
      if (set.has(t.dataset.hint)) set.delete(t.dataset.hint);
      else if (set.size + game.size >= 3) { notice = 'A sequence has only three requiems - undo one of the known ones first.'; render(); return; }
      else set.add(t.dataset.hint);
      send({ op: 'hints', id: h.id, hints: [...set] });
      return;
    }
    if (t.dataset.nemOull != null) { send({ op: 'prefs', allowOull: !data.prefs.allowOull }); return; }
    if (t.dataset.remove != null && h) {
      const key = 'stab:' + t.dataset.remove;
      if (armed !== key) { arm(key); return; }
      armed = null;
      send({ op: 'remove', id: h.id, index: Number(t.dataset.remove) });
      return;
    }
    if (t.dataset.nemStart) { send({ op: 'start', kind: t.dataset.nemStart }); return; }
    if (t.dataset.nemFinish) { send({ op: 'finish', id: t.dataset.nemFinish }); return; }
    if (t.dataset.nemDelete) {
      const key = 'del:' + t.dataset.nemDelete;
      if (armed !== key) { arm(key); return; }
      armed = null;
      send({ op: 'delete', id: t.dataset.nemDelete });
    }
  }

  async function refreshInventory() {
    const btn = $('btn-nem-refresh');
    btn.disabled = true;
    btn.innerHTML = Icon.refresh(15) + '<span>Searching game memory …</span>';
    const res = await window.api.refreshInventory();
    btn.disabled = false;
    btn.innerHTML = Icon.refresh(15) + '<span>Fetch inventory</span>';
    if (res.ok) {
      notice = null;
      await load(true);
    } else {
      notice = res.error || 'Could not fetch the inventory.';
      if (data) render(); else showError(notice);
    }
    if (typeof refreshScanLogLine === 'function') refreshScanLogLine();
  }

  function init() {
    const tab = $('tab-nemesis');
    if (!tab) return;
    tab.addEventListener('click', onClick);
    const btn = $('btn-nem-refresh');
    if (btn) {
      btn.innerHTML = Icon.refresh(15) + '<span>Fetch inventory</span>';
      btn.onclick = refreshInventory;
    }
    if (window.api.onRequiemChanged) window.api.onRequiemChanged(() => invalidate());
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  return { load, invalidate, showPane };
})();
