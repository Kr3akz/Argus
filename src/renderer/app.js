/* Renderer. Laeuft ohne Node-Zugriff - alles geht ueber window.api (preload.cjs). */

const $  = id => document.getElementById(id);
const nf = n => (n ?? 0).toLocaleString('de-DE');

/** Item-Namen kommen aus fremden Daten - vor dem Einsetzen entschaerfen. */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let state = null;
let checklistCache = [];
let buildsLoaded = false;

/* ---------------- Icons einsetzen ---------------- */
$('btn-overlay').innerHTML = Icon.pip(15);

/* Hotkey-Anzeige in der Titelleiste. Der Wert kommt aus dem Main-Prozess,
   damit hier nie eine andere Taste steht als die registrierte. */
window.api.overlayHotkey().then(hk => {
  const el = $('hotkey-hint');
  if (!el || !hk) return;
  el.innerHTML = hk.split('+').map(k => `<kbd>${esc(k)}</kbd>`).join('');
  el.title = `Overlay ein- und ausblenden (${hk})`;
  el.classList.remove('hidden');
}).catch(() => {});
$('btn-min').innerHTML     = Icon.minus(15);
$('btn-close').innerHTML   = Icon.close(15);
if ($('ic-goalsearch')) $('ic-goalsearch').innerHTML   = Icon.search(16);
if ($('ic-filtersearch')) $('ic-filtersearch').innerHTML = Icon.search(16);
if ($('ic-buildimport')) $('ic-buildimport').innerHTML  = Icon.link(16);
if ($('ic-modsearch')) $('ic-modsearch').innerHTML    = Icon.search(16);
if ($('ic-fgsearch')) $('ic-fgsearch').innerHTML     = Icon.search(16);
if ($('ic-ducatsearch')) $('ic-ducatsearch').innerHTML  = Icon.search(16);
if ($('ic-invsearch')) $('ic-invsearch').innerHTML    = Icon.search(16);
if ($('btn-inv-refresh')) $('btn-inv-refresh').innerHTML = Icon.refresh(15) + '<span>Inventar abrufen</span>';
if ($('btn-refresh')) $('btn-refresh').innerHTML = Icon.refresh(15) + '<span>Profil aktualisieren</span>';
if ($('btn-refresh-worldstate')) $('btn-refresh-worldstate').innerHTML = Icon.refresh(14) + ' <span>Neu laden</span>';

document.querySelectorAll('[data-icon]').forEach(el => {
  const name = el.dataset.icon;
  if (Icon[name]) {
    const size = el.classList.contains('sb-logo') ? 26 : el.classList.contains('nav-icon') ? 22 : 15;
    el.innerHTML = Icon[name](size);
  }
});

/* ---------------- Fenstersteuerung ---------------- */
$('btn-min').onclick     = () => window.api.minimize();
$('btn-close').onclick   = () => window.api.close();
/* Das Overlay ist ein eigenes Fenster (overlay.html). Hier bleibt nur der
   Schalter und die Anzeige, ob es gerade offen ist. */
$('btn-overlay').onclick = async () => syncOverlayBadge(await window.api.toggleOverlay());

function syncOverlayBadge(st) {
  const on = !!(st && st.overlay);
  $('overlay-badge').classList.toggle('hidden', !on);
  $('btn-overlay').classList.toggle('on', on);
}

/* Auch der Hotkey aendert den Zustand - ohne dieses Ereignis zeigte die
   Titelleiste weiter "zu", waehrend das Overlay offen ist. */
window.api.onOverlayChanged(syncOverlayBadge);
window.api.overlayState().then(syncOverlayBadge).catch(() => {});

/* ---------------- Sidebar Navigation ---------------- */
function showTab(name) {
  if (name === 'checklist') name = 'goals';
  document.querySelectorAll('.nav-item').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.tabpane').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));
  if (name === 'goals') {
    if (!checklistCache.length) loadChecklist();
    if (state) renderGoals(state);
  }
  if (name === 'builds' && !buildsLoaded) loadBuilds();
  if (name === 'worldstate') loadWorldState();
  if (name === 'farmguide') loadFarmGuide();
  if (name === 'ducats') loadDucats();
  if (name === 'inventory') loadInventoryTab();
}

document.querySelectorAll('.nav-item').forEach(tab => {
  tab.onclick = () => showTab(tab.dataset.tab);
});

if ($('btn-to-goals')) $('btn-to-goals').onclick = () => showTab('goals');

/* ---------------- Laden & Refresh ---------------- */
async function boot() {
  const res = await window.api.getDashboard();
  $('loading').classList.add('hidden');
  if (!res.ok) {
    $('error').classList.remove('hidden');
    $('error').textContent = 'Fehler: ' + res.error;
    return;
  }
  $('app').classList.remove('hidden');
  render(res.data);
}

let refreshTimer = null;

async function doRefreshProfile() {
  const btnHero = $('btn-refresh');
  const btnSb   = $('sb-btn-refresh');
  const sbTitle = $('sb-refresh-title');
  const sbSub   = $('sb-refresh-sub');

  if (refreshTimer) clearTimeout(refreshTimer);

  if (btnHero) {
    btnHero.disabled = true;
    btnHero.classList.add('is-refreshing');
    btnHero.innerHTML = Icon.refresh(15) + '<span>Frage ab …</span>';
  }

  if (btnSb) {
    btnSb.disabled = true;
    btnSb.classList.add('is-refreshing');
    btnSb.classList.add('show-feedback');
    if (sbTitle) sbTitle.textContent = 'Aktualisiere …';
    if (sbSub)   sbSub.textContent   = 'Frage Warframe-API ab …';
  }

  const res = await window.api.refreshProfile();

  if (btnHero) {
    btnHero.disabled = false;
    btnHero.classList.remove('is-refreshing');
    btnHero.innerHTML = Icon.refresh(15) + '<span>Profil aktualisieren</span>';
  }

  if (btnSb) {
    btnSb.disabled = false;
    btnSb.classList.remove('is-refreshing');
    if (res.ok) {
      if (sbTitle) sbTitle.textContent = 'Aktualisiert!';
      if (sbSub)   sbSub.textContent   = 'Profil ist auf dem neuesten Stand';
    } else {
      if (sbTitle) sbTitle.textContent = 'Fehler';
      if (sbSub)   sbSub.textContent   = res.error || 'Fehler beim Laden';
    }

    refreshTimer = setTimeout(() => {
      btnSb.classList.remove('show-feedback');
      if (sbTitle) sbTitle.textContent = 'Aktualisieren';
      if (sbSub)   sbSub.textContent   = 'Profil & Daten neu laden';
    }, 2500);
  }

  if (res.ok) render(res.data);
  else $('meta-info').textContent = res.error;
}

if ($('btn-refresh')) $('btn-refresh').onclick = doRefreshProfile;
if ($('sb-btn-refresh')) $('sb-btn-refresh').onclick = doRefreshProfile;

/* ---------------- Rendern ---------------- */
function render(data) {
  state = data;
  const p = data.player;

  $('player-name').textContent = p.name || '—';
  $('mr-name').textContent     = p.mrName;
  $('mr-value').textContent    = p.mr;

  $('progress-fill').style.width = Math.min(100, p.progress.percent).toFixed(1) + '%';
  /* Bei einer bekannten Luecke ist die Summe eine Untergrenze - das "mind."
     sagt genau das, statt eine Genauigkeit vorzutaeuschen. */
  $('progress-text').textContent = (p.hiddenXP > 0 ? 'mind. ' : '') + nf(p.progress.current) + ' MR-XP';
  $('progress-next').textContent = 'Noch ' + nf(p.progress.remaining) + ' bis MR ' + (p.mr + 1);

  $('stat-done').textContent      = nf(p.counts.done);
  $('stat-partial').textContent   = nf(p.counts.partial);
  $('stat-missing').textContent   = nf(p.counts.missing);
  $('stat-open').textContent      = nf(p.openGain);
  $('stat-potential').textContent = p.potentialMR;

  renderLoadout(p);
  renderHeroTags(p);
  renderXpSplit(p.breakdown, p.totalXP);

  const m = data.meta;
  const parts = [];
  parts.push(m.fetchedAt
    ? 'Stand: ' + new Date(m.fetchedAt).toLocaleString('de-DE')
    : 'Noch keine Profildaten');
  if (m.fromCache) parts.push('Lokaler Cache');
  /* Der Rang stammt aus dem Profil. Weicht unsere XP-Summe davon ab, fehlt uns
     eine Quelle, die das oeffentliche Profil nicht ausweist - das gehoert
     dazugesagt, sonst wirkt die XP-Zahl praeziser als sie ist. */
  if (p.hiddenXP > 0) {
    parts.push(`mind. ${nf(p.hiddenXP)} MR-XP aus Quellen, die das Profil nicht ausweist`);
  }
  if (m.message)   parts.push(m.message);
  $('meta-info').textContent = parts.join(' · ');

  renderActiveGoals(data);
  renderCards('quick-wins', data.quickWins);
  renderCards('easy-gains', data.easyGains);
  renderCards('warframes', data.warframes);
  renderCategories(data.categories);
  renderGoals(data);
  renderNotes(data);

  if ($('goal-count')) $('goal-count').textContent = data.goals.filter(g => !g.done).length;
}

/* ---------------- Profilkopf ---------------- */
function renderLoadout(p) {
  const col = $('hero-character-col');
  if (!p.loadout || !p.loadout.image) {
    if (col) col.hidden = true;
    return;
  }
  if (col) col.hidden = false;
  $('hero-warframe-img').src = p.loadout.image;
}

function renderHeroTags(p) {
  const tags = [];
  if (p.clan)         tags.push([Icon.users(13),    p.clan]);
  if (p.loadout?.focus) tags.push([Icon.star(13),   p.loadout.focus]);
  if (p.yearsPlayed)  tags.push([Icon.calendar(13), 'Seit ' + new Date(p.createdMs).getFullYear() + ' · ' + p.yearsPlayed + ' Jahre']);
  if (p.nodes)        tags.push([Icon.map(13),      nf(p.nodes) + ' Nodes · ' + p.junctions + ' Junctions']);

  $('hero-tags').innerHTML = tags
    .map(([ic, text]) => `<span class="htag">${ic}${esc(text)}</span>`).join('');
}

/** Gestapelter Balken: welcher Anteil der MR-XP kommt woher. */
const XP_PARTS = [
  ['items',      'Items',      '#4a9eff'],
  ['nodes',      'Nodes',      '#7c6cff'],
  ['intrinsics', 'Intrinsics', '#f0b849'],
  ['junctions',  'Junctions',  '#4ade80']
];

function renderXpSplit(breakdown, total) {
  if (!breakdown || !total) return;
  const parts = XP_PARTS
    .map(([key, label, color]) => ({ label, color, value: breakdown[key] || 0 }))
    .filter(p => p.value > 0);

  $('xpbar').innerHTML = parts
    .map(p => `<i style="width:${(p.value / total * 100).toFixed(2)}%;background:${p.color}"></i>`)
    .join('');

  $('xplegend').innerHTML = parts.map(p =>
    `<span><em style="background:${p.color}"></em>${esc(p.label)} <b>${nf(p.value)}</b></span>`
  ).join('');
}

/* ---------------- Aktive Ziele auf dem Dashboard ---------------- */
function renderActiveGoals(data) {
  const open = data.goals.filter(g => !g.done);
  const wrap = $('active-goals-wrap');

  if (!open.length) { wrap.classList.add('hidden'); return; }
  wrap.classList.remove('hidden');

  $('active-goals').innerHTML = open.map(g => {
    const isLevel = g.owned || g.kind === 'level';
    const compList = (g.components && g.components.length > 0) ? g.components : (g.materials || []);
    const shown = compList.slice(0, 5);
    const rest  = compList.length - shown.length;
    const progressPct = g.maxLvl ? Math.min(100, (g.rank / g.maxLvl) * 100).toFixed(1) : 0;

    return `
    <div class="agoal ${isLevel ? 'agoal-level' : 'agoal-farm'}" data-item-u="${esc(g.uniqueName)}">
      <div class="agoal-head">
        <img src="${esc(g.image)}" alt="" onerror="this.style.visibility='hidden'">
        <div class="agoal-head-info">
          <div class="agoal-title-row">
            <h3>${esc(g.name)}</h3>
            <span class="agoal-badge ${isLevel ? 'level' : 'farm'}">
              ${isLevel ? Icon.bolt(12) + ' Leveln' : Icon.target(12) + ' Farmen'}
            </span>
          </div>
          <div class="agoal-meta">
            ${isLevel
              ? `<span>Im Inventar</span> · <span>Rang ${g.rank}/${g.maxLvl}</span>`
              : `<span>${Icon.coin(12)} ${nf(g.credits)}</span> <span>${Icon.clock(12)} ${esc(g.buildTime)}</span>`
            }
          </div>
        </div>
        <div class="agoal-head-right">
          <span class="agoal-gain">+${nf(g.gain)}</span>
          <div class="agoal-actions">
            <button class="btn-icon ${g.done ? 'on' : ''}" data-goal-toggle="${esc(g.uniqueName)}" title="${g.done ? 'Als offen markieren' : 'Als erledigt markieren'}">
              ${Icon.check(13)}
            </button>
            <button class="btn-icon danger" data-goal-remove="${esc(g.uniqueName)}" title="Ziel entfernen">
              ${Icon.trash(13)}
            </button>
          </div>
        </div>
      </div>

      ${isLevel ? `
        <div class="agoal-level-box">
          <div class="level-box-head">
            <span>Level-Fortschritt</span>
            <b>Noch ${g.ranksLeft} ${g.ranksLeft === 1 ? 'Rang' : 'Ränge'}</b>
          </div>
          <div class="level-track"><div class="level-fill" style="width: ${progressPct}%"></div></div>
        </div>
      ` : `
        <div class="agoal-mats">
          ${shown.map(m => `
            <span class="chip">
              ${m.image ? `<img class="mat-icon" src="${esc(m.image)}" alt="" onerror="this.style.display='none'">` : ''}
              <span>${esc(m.name)}</span>
              <b>${nf(m.count)}</b>
            </span>`).join('')}
          ${rest > 0 ? `<span class="chip more">+${rest} weitere</span>` : ''}
        </div>
      `}

      ${g.note && g.note.trim()
        ? `<div class="agoal-note">${Icon.note(13)}<span>${esc(g.note)}</span></div>` : ''}
    </div>`;
  }).join('');

  $('active-goals').querySelectorAll('.agoal').forEach(card => {
    card.onclick = e => {
      if (e.target.closest('[data-goal-toggle]') || e.target.closest('[data-goal-remove]')) return;
      openItemModal(card.dataset.itemU);
    };
  });

  $('active-goals').querySelectorAll('[data-goal-toggle]').forEach(b => b.onclick = async e => {
    e.stopPropagation();
    const r = await window.api.toggleGoal(b.dataset.goalToggle);
    if (r.ok) render(r.data);
  });
  $('active-goals').querySelectorAll('[data-goal-remove]').forEach(b => b.onclick = async e => {
    e.stopPropagation();
    const r = await window.api.removeGoal(b.dataset.goalRemove);
    if (r.ok) render(r.data);
  });
}

if ($('btn-to-goals')) $('btn-to-goals').onclick = () => showTab('goals');

function renderCards(target, list) {
  const el = $(target);
  if (!list.length) { el.innerHTML = '<div class="empty">Nichts offen</div>'; return; }

  const inGoals = new Set((state?.goals || []).map(g => g.uniqueName));

  el.innerHTML = list.map(r => {
    const already = inGoals.has(r.uniqueName);
    return `
    <div class="card" data-item-u="${esc(r.uniqueName)}">
      <img src="${esc(r.image)}" alt="" onerror="this.style.visibility='hidden'">
      <div class="card-body">
        <div class="card-title">
          <b>${esc(r.name)}</b>
          <span class="gain">+${nf(r.gain)}</span>
        </div>
        <div class="card-cat">${esc(r.label)}</div>
        <div class="card-reason">${esc(r.reason)}</div>
        <div class="card-actions">
          <button class="btn-sm ${already ? 'on' : ''}" data-add="${esc(r.uniqueName)}" data-name="${esc(r.name)}">
            ${already ? Icon.check(13) + '<span>Als Ziel gesetzt</span>'
                      : Icon.plus(13)  + '<span>Als Ziel</span>'}
          </button>
        </div>
      </div>
    </div>`;
  }).join('');

  el.querySelectorAll('.card').forEach(card => {
    card.onclick = e => {
      if (e.target.closest('[data-add]')) return;
      openItemModal(card.dataset.itemU);
    };
  });

  el.querySelectorAll('[data-add]').forEach(b => {
    b.onclick = async e => {
      e.stopPropagation();
      const res = await window.api.addGoal(b.dataset.add, b.dataset.name);
      if (res.ok) render(res.data);
    };
  });
}

function renderCategories(cats) {
  $('categories').innerHTML = cats.map(c => {
    const pct = c.total ? (c.done / c.total * 100) : 0;
    return `<div class="catrow">
      <span>${esc(c.label)}</span>
      <div class="catbar"><div style="width:${pct.toFixed(1)}%"></div></div>
      <span class="catnum">${c.done} / ${c.total}</span>
      <span class="catgain">${nf(c.gain)} offen</span>
    </div>`;
  }).join('');
}

/* ---------------- Ziele ---------------- */
function renderGoals(data) {
  const el = $('goals');
  if (!el) return;

  if (!data.goals || !data.goals.length) {
    el.innerHTML = '<div class="empty">Noch keine Ziele gesetzt. Wähle unten im Katalog ein beliebiges Item und klicke auf „Als Ziel setzen“.</div>';
    if ($('shopping')) $('shopping').classList.add('hidden');
    if (checklistCache.length) drawChecklist();
    return;
  }

  el.innerHTML = data.goals.map(g => {
    const isLevel = g.owned || g.kind === 'level';
    const progressPct = g.maxLvl ? Math.min(100, (g.rank / g.maxLvl) * 100).toFixed(1) : 0;

    return `
    <div class="goal ${g.done ? 'done' : ''} ${isLevel ? 'goal-level' : 'goal-farm'}" data-item-u="${esc(g.uniqueName)}">
      <div class="goal-head">
        <img src="${esc(g.image)}" alt="" onerror="this.style.visibility='hidden'">
        <div>
          <div class="goal-title-row">
            <h3>${esc(g.name)}</h3>
            <span class="agoal-badge ${isLevel ? 'level' : 'farm'}">
              ${isLevel ? Icon.bolt(12) + ' Leveln' : Icon.target(12) + ' Farmen'}
            </span>
          </div>
          <div class="goal-sub">
            <span class="gain">+${nf(g.gain)} MR-XP</span>
            ${isLevel
              ? `<span>Im Inventar</span> · <span>Rang ${g.rank}/${g.maxLvl}</span>`
              : `<span>${Icon.coin(13)} ${nf(g.credits)}</span> <span>${Icon.clock(13)} ${esc(g.buildTime)}</span>`
            }
          </div>
        </div>
        <div class="goal-actions">
          <button class="btn-sm ${g.done ? 'on' : ''}" data-toggle="${esc(g.uniqueName)}">
            ${Icon.check(13)}<span>${g.done ? 'Erledigt' : 'Als erledigt'}</span>
          </button>
          <button class="btn-sm danger" data-remove="${esc(g.uniqueName)}">
            ${Icon.trash(13)}<span>Entfernen</span>
          </button>
        </div>
      </div>
      <div class="goal-body">
        ${isLevel ? `
          <div class="goal-level-box">
            <div class="level-box-head">
              <span>Aktueller Rang: <b>${g.rank} / ${g.maxLvl}</b></span>
              <span>Noch <b>${g.ranksLeft} ${g.ranksLeft === 1 ? 'Rang' : 'Ränge'}</b> bis max (${progressPct}%)</span>
            </div>
            <div class="level-track"><div class="level-fill" style="width: ${progressPct}%"></div></div>
          </div>
        ` : `
          ${g.components && g.components.length > 0 ? `
            <div class="goal-section-label">Benötigte Bauteile & Komponenten</div>
            <div class="goal-comps-grid">
              ${g.components.map(c => `
                <div class="goal-comp-item ${c.isSubRecipe ? 'craftable' : ''}">
                  <img class="mat-icon" src="${esc(c.image)}" alt="" onerror="this.style.display='none'">
                  <div class="goal-comp-body">
                    <b>${esc(c.name)}</b>
                    <span>${c.isSubRecipe ? 'Wird geschmiedet (12h)' : 'Ressource / Teil'}</span>
                  </div>
                  <span class="goal-comp-count">${c.count}x</span>
                </div>
              `).join('')}
            </div>
          ` : ''}

          ${g.materials && g.materials.length > 0 ? `
            <div class="goal-section-label" style="margin-top: ${g.components && g.components.length > 0 ? '14px' : '0'};">Gesamte Rohstoffe & Materialien</div>
            <div class="matgrid">
              ${g.materials.map(mt => `
                <div class="mat">
                  ${mt.image ? `<img class="mat-icon" src="${esc(mt.image)}" alt="" onerror="this.style.display='none'">` : ''}
                  <span>${esc(mt.name)}</span>
                  <b>${nf(mt.count)}</b>
                </div>`).join('')}
            </div>
          ` : ''}
        `}
        <textarea class="goal-note" data-note="${esc(g.uniqueName)}"
          placeholder="Notiz zu diesem Ziel …">${esc(g.note)}</textarea>
      </div>
    </div>`;
  }).join('');

  el.querySelectorAll('.goal-head').forEach(gh => {
    gh.style.cursor = 'pointer';
    gh.onclick = e => {
      if (e.target.closest('[data-toggle]') || e.target.closest('[data-remove]')) return;
      const gEl = gh.closest('.goal');
      if (gEl && gEl.dataset.itemU) openItemModal(gEl.dataset.itemU);
    };
  });

  el.querySelectorAll('[data-toggle]').forEach(b => b.onclick = async e => {
    e.stopPropagation();
    const r = await window.api.toggleGoal(b.dataset.toggle); if (r.ok) render(r.data);
  });
  el.querySelectorAll('[data-remove]').forEach(b => b.onclick = async e => {
    e.stopPropagation();
    const r = await window.api.removeGoal(b.dataset.remove); if (r.ok) render(r.data);
  });
  el.querySelectorAll('[data-note]').forEach(t => {
    let timer;
    t.oninput = () => {
      clearTimeout(timer);
      timer = setTimeout(() => window.api.setNote(t.dataset.note, t.value), 600);
    };
  });

  const s = data.shopping;
  if (s && s.materials && s.materials.length) {
    $('shopping').classList.remove('hidden');
    $('shop-credits').textContent = nf(s.credits);
    $('shop-time').textContent    = s.buildTime;
    $('shopping-mats').innerHTML  = s.materials
      .map(mt => `
        <div class="mat">
          ${mt.image ? `<img class="mat-icon" src="${esc(mt.image)}" alt="" onerror="this.style.display='none'">` : ''}
          <span>${esc(mt.name)}</span>
          <b>${nf(mt.count)}</b>
        </div>`).join('');
  } else {
    $('shopping').classList.add('hidden');
  }

  if (checklistCache.length) drawChecklist();
}

/* ---------------- Zielsuche (optional) ---------------- */
if ($('goal-search')) {
  let searchTimer;
  $('goal-search').oninput = e => {
    clearTimeout(searchTimer);
    const q = e.target.value;
    searchTimer = setTimeout(async () => {
      const results = await window.api.searchItems(q);
      const box = $('goal-results');
      if (!box) return;
      if (!results.length) { box.classList.add('hidden'); return; }
      box.classList.remove('hidden');
      box.innerHTML = results.map(r => `
        <div class="result" data-u="${esc(r.uniqueName)}" data-n="${esc(r.name)}">
          <img src="${esc(r.image)}" alt="" onerror="this.style.visibility='hidden'">
          <span>${esc(r.name)}</span>
          <span class="result-meta">${esc(r.label)} · ${r.status === 'done' ? 'Fertig' : '+' + nf(r.gain)}</span>
        </div>`).join('');
      box.querySelectorAll('.result').forEach(row => row.onclick = () => {
        openItemModal(row.dataset.u);
        $('goal-search').value = '';
        box.classList.add('hidden');
      });
    }, 220);
  };
  document.addEventListener('click', e => {
    if (!e.target.closest('.searchbox') && $('goal-results')) $('goal-results').classList.add('hidden');
  });
}

/* ---------------- Builds ---------------- */
async function loadBuilds() {
  const res = await window.api.getBuilds();
  if (res.ok) { buildsLoaded = true; renderBuilds(res.data); }
  else showImportStatus('err', res.error);
}

function showImportStatus(kind, text) {
  const el = $('import-status');
  el.classList.remove('hidden', 'ok', 'err', 'busy');
  el.classList.add(kind);
  const ic = kind === 'err' ? Icon.warning(15) : kind === 'ok' ? Icon.check(15) : Icon.refresh(15);
  el.innerHTML = ic + '<span>' + esc(text) + '</span>';
}

$('btn-import').onclick = async () => {
  const input = $('build-url').value.trim();
  if (!input) return;
  const btn = $('btn-import');
  btn.disabled = true;
  showImportStatus('busy', 'Lade Build von Overframe … das kann einen Moment dauern.');

  const res = await window.api.importBuild(input);
  btn.disabled = false;

  if (!res.ok) { showImportStatus('err', res.error); return; }

  let msg = 'Build importiert.';
  if (res.note) msg += ' ' + res.note + '.';
  if (res.unresolved) {
    msg += ` ${res.unresolved} Einträge ohne Zuordnung `
         + '(meist Arcanes – die stehen nicht im Mod-Katalog).';
  }
  showImportStatus('ok', msg);
  $('build-url').value = '';
  renderBuilds(res.data);
};

$('build-url').addEventListener('keydown', e => { if (e.key === 'Enter') $('btn-import').click(); });

function renderBuilds(data) {
  $('build-count').textContent = data.builds.length;
  renderTotals(data.totals, data.builds);
  renderMissingMods(data.missingMods);

  const el = $('builds');
  if (!data.builds.length) {
    el.innerHTML = '<div class="empty">Noch keine Builds. Oben einen Overframe-Link einfügen.</div>';
    return;
  }

  el.innerHTML = data.builds.map(b => {
    const pct = Math.min(100, Math.max(0, b.used / b.capacity * 100));
    return `
    <div class="build">
      <div class="build-head">
        ${b.image ? `<img src="${esc(b.image)}" alt="" onerror="this.style.visibility='hidden'">` : ''}
        <div>
          <h3>${esc(b.name)}</h3>
          <div class="build-sub">
            <span>${esc(b.itemName)}</span>
            ${b.author ? `<span>von ${esc(b.author)}</span>` : ''}
            <span>${Icon.bolt(12)} ${b.requirements.forma} Forma</span>
            <span>${b.mods.owned} / ${b.mods.total} Mods vorhanden</span>
          </div>
        </div>
        <div class="build-actions">
          <button class="btn-sm danger" data-delbuild="${esc(b.id)}">${Icon.trash(13)}<span>Entfernen</span></button>
        </div>
      </div>
      <div class="capbar">
        <div class="capbar-track">
          <div class="capbar-fill ${b.overCapacity ? 'over' : ''}" style="width:${pct}%"></div>
        </div>
        <div class="capbar-label">
          <span>Kapazität ${b.used} / ${b.capacity}</span>
          <span>${b.overCapacity ? 'Überzogen um ' + (b.used - b.capacity) : b.free + ' frei'}</span>
        </div>
      </div>
      <div class="slots">${b.slots.map((s, i) => renderSlot(s, i, b.source === 'manual', b.id)).join('')}</div>
    </div>`;
  }).join('');

  el.querySelectorAll('[data-delbuild]').forEach(btn => btn.onclick = async () => {
    const r = await window.api.removeBuild(btn.dataset.delbuild);
    if (r.ok) renderBuilds(r.data);
  });

  // Klick auf einen Mod-Slot schaltet den Besitz um
  el.querySelectorAll('[data-slotmod]').forEach(sl => sl.onclick = async () => {
    const r = await window.api.setModOwned(sl.dataset.slotmod, sl.dataset.owned !== 'true');
    if (r.ok) renderBuilds(r.data);
  });

  // Bei eigenen Builds oeffnet der Klick stattdessen den Slot-Editor
  el.querySelectorAll('[data-editslot]').forEach(sl => sl.onclick = () => {
    const build = data.builds.find(b => b.id === sl.dataset.buildid);
    if (build) openSlotEditor(build.id, Number(sl.dataset.editslot), build);
  });
}

/** Slot 9 ist der Aura-/Stance-Platz, Slot 10 der Exilus-Platz. */
function slotKind(i) {
  if (i === 8) return 'Aura / Stance';
  if (i === 9) return 'Exilus';
  return null;
}

function renderSlot(s, i, editable, buildId) {
  const kind = slotKind(i);
  const edit = editable ? ` data-editslot="${i}" data-buildid="${esc(buildId)}"` : '';

  if (!s) {
    if (!editable) return '<div class="slot slot-empty"><div class="slot-top"><span class="slot-name">leer</span></div></div>';
    return `<div class="slot addslot editable"${edit}>
      ${Icon.plus(15)}<span class="slot-kind">${esc(kind || 'Mod wählen')}</span></div>`;
  }
  if (s.unknown) {
    return `<div class="slot"><div class="slot-top">
      <span class="slot-name">Nicht zugeordnet</span></div>
      <div class="slot-meta">${Icon.warning(11)} kein Katalog-Eintrag</div></div>`;
  }

  const cls = s.isAura ? 'aura' : (s.owned ? 'owned' : 'missing');
  // Im Editor oeffnet der Klick den Slot, sonst schaltet er den Besitz um.
  const attrs = editable ? edit : ` data-slotmod="${esc(s.uniqueName)}" data-owned="${s.owned}"`;
  return `
    <div class="slot ${cls} ${editable ? 'editable' : ''}"${attrs}
         title="${esc((s.stats || []).join(' · '))}">
      <div class="slot-top">
        <span class="slot-name">${esc(s.name)}</span>
        <span class="slot-drain ${s.isAura ? 'aura' : ''}">${s.isAura ? '↑' + Math.abs(s.drain) : s.drain}</span>
      </div>
      <div class="slot-meta">
        <span>Rang ${s.rank}/${s.maxRank}</span>
        ${s.polaritySymbol ? `<span class="slot-pol">${esc(s.polaritySymbol)}</span>` : ''}
        <span>${s.owned ? '✓ vorhanden' : 'fehlt'}</span>
      </div>
    </div>`;
}

/* ---------------- Eigenen Build anlegen ---------------- */
$('btn-new-build').onclick = () => {
  const p = $('newbuild-panel');
  p.classList.toggle('hidden');
  if (!p.classList.contains('hidden')) $('newbuild-item').focus();
};

let newBuildTimer;
$('newbuild-item').oninput = e => {
  clearTimeout(newBuildTimer);
  const q = e.target.value;
  newBuildTimer = setTimeout(async () => {
    const results = await window.api.itemsForBuild(q);
    const box = $('newbuild-results');
    if (!results.length) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    box.innerHTML = results.map(r => `
      <div class="result" data-item="${esc(r.uniqueName)}" data-name="${esc(r.name)}">
        <img src="${esc(r.image)}" alt="" onerror="this.style.visibility='hidden'">
        <span>${esc(r.name)}</span>
        <span class="result-meta">${esc(r.label)}</span>
      </div>`).join('');
    box.querySelectorAll('.result').forEach(row => row.onclick = async () => {
      const res = await window.api.createBuild(row.dataset.item, row.dataset.name + '-Build');
      if (res.ok) {
        renderBuilds(res.data);
        $('newbuild-item').value = '';
        box.classList.add('hidden');
        $('newbuild-panel').classList.add('hidden');
        showImportStatus('ok', `Build für ${row.dataset.name} angelegt – jetzt die Slots füllen.`);
      } else showImportStatus('err', res.error);
    });
  }, 220);
};

/* ---------------- Slot-Editor ---------------- */
const editor = { buildId: null, slotIndex: null, mod: null, rank: 0, polarity: null, itemUniqueName: null };
let POLARITY_LIST = [];

async function openSlotEditor(buildId, slotIndex, build) {
  editor.buildId = buildId;
  editor.slotIndex = slotIndex;
  editor.itemUniqueName = build.itemUniqueName;
  editor.mod = null; editor.rank = 0; editor.polarity = null;

  if (!POLARITY_LIST.length) POLARITY_LIST = await window.api.getPolarities();

  const existing = build.slots[slotIndex];
  $('slot-modal-title').textContent = slotKind(slotIndex) || `Slot ${slotIndex + 1}`;
  $('slot-modal-sub').textContent = build.itemName + ' · ' + build.name;
  $('modsearch').value = '';
  $('modsearch-results').innerHTML = '';
  $('slot-config').classList.add('hidden');
  $('slot-modal').classList.remove('hidden');
  $('modsearch').focus();

  // Belegten Slot direkt zum Bearbeiten oeffnen
  if (existing && existing.uniqueName) {
    selectMod({
      uniqueName: existing.uniqueName, name: existing.name,
      maxRank: existing.maxRank, baseDrain: existing.baseDrain,
      polarity: existing.modPolarity, rarityLabel: '', isAura: existing.isAura
    }, existing.rank, existing.polarity);
  }
}

function closeSlotEditor() { $('slot-modal').classList.add('hidden'); }
$('slot-modal-close').onclick = closeSlotEditor;
$('slot-modal').addEventListener('click', e => { if (e.target.id === 'slot-modal') closeSlotEditor(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSlotEditor(); });

let modSearchTimer;
$('modsearch').oninput = e => {
  clearTimeout(modSearchTimer);
  const q = e.target.value;
  modSearchTimer = setTimeout(async () => {
    const results = await window.api.searchMods(q, editor.itemUniqueName);
    $('modsearch-results').innerHTML = results.map((m, i) => `
      <div class="modopt" data-i="${i}">
        <b>${esc(m.name)}</b>
        ${m.isAura ? '<span class="modtag">Aura</span>' : ''}
        ${m.isExilus ? '<span class="modtag">Exilus</span>' : ''}
        <span class="mo-meta">
          ${m.polaritySymbol ? `<span class="pol">${esc(m.polaritySymbol)}</span>` : ''}
          <span>${esc(m.rarityLabel)}</span>
          <span>${m.owned ? '✓ vorhanden' : 'fehlt'}</span>
        </span>
      </div>`).join('');
    $('modsearch-results').querySelectorAll('.modopt').forEach(el => {
      el.onclick = () => selectMod(results[Number(el.dataset.i)]);
    });
  }, 200);
};

function selectMod(mod, rank = null, polarity = null) {
  editor.mod = mod;
  editor.rank = rank ?? mod.maxRank ?? 0;
  editor.polarity = polarity ?? null;

  $('slot-config').classList.remove('hidden');
  $('sc-name').textContent = mod.name;
  $('sc-meta').textContent = [mod.rarityLabel, mod.isAura ? 'Aura' : null, mod.isExilus ? 'Exilus' : null]
    .filter(Boolean).join(' · ');

  const rangeEl = $('sc-rank');
  rangeEl.max = mod.maxRank ?? 10;
  rangeEl.value = editor.rank;
  $('sc-rank-val').textContent = editor.rank;

  $('sc-polarities').innerHTML =
    `<button class="polbtn ${!editor.polarity ? 'on' : ''}" data-pol="">–</button>` +
    POLARITY_LIST.filter(p => !['AP_ANY', 'AP_PRECEPT'].includes(p.key)).map(p =>
      `<button class="polbtn ${editor.polarity === p.key ? 'on' : ''}" data-pol="${esc(p.key)}"
               title="${esc(p.label)}">${esc(p.symbol)}</button>`).join('');

  $('sc-polarities').querySelectorAll('.polbtn').forEach(b => b.onclick = () => {
    editor.polarity = b.dataset.pol || null;
    $('sc-polarities').querySelectorAll('.polbtn').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    updateDrainPreview();
  });
  updateDrainPreview();
}

$('sc-rank').oninput = e => {
  editor.rank = Number(e.target.value);
  $('sc-rank-val').textContent = editor.rank;
  updateDrainPreview();
};

/** Vorschau des Kapazitätsverbrauchs – dieselbe Regel wie im Kern. */
function updateDrainPreview() {
  const m = editor.mod;
  if (!m) return;
  const base = Math.abs(m.baseDrain || 0) + editor.rank;
  const matches = editor.polarity && (editor.polarity === m.polarity || editor.polarity === 'AP_UNIVERSAL');

  let text;
  if (m.isAura) {
    text = `Gibt ${matches ? base * 2 : base} Kapazität${matches ? ' (Polarität passt, verdoppelt)' : ''}`;
  } else if (matches) {
    text = `Kostet ${Math.ceil(base / 2)} statt ${base} – Polarität passt`;
  } else if (editor.polarity) {
    text = `Kostet ${Math.ceil(base * 1.25)} statt ${base} – Polarität passt nicht`;
  } else {
    text = `Kostet ${base} Kapazität`;
  }
  $('sc-drain').textContent = text;
}

$('sc-apply').onclick = async () => {
  if (!editor.mod) return;
  const res = await window.api.setBuildSlot(editor.buildId, editor.slotIndex, {
    mod: editor.mod.uniqueName, rank: editor.rank, polarity: editor.polarity
  });
  if (res.ok) { renderBuilds(res.data); closeSlotEditor(); }
};

$('sc-clear').onclick = async () => {
  const res = await window.api.setBuildSlot(editor.buildId, editor.slotIndex, null);
  if (res.ok) { renderBuilds(res.data); closeSlotEditor(); }
};

function renderTotals(t, builds) {
  const wrap = $('build-totals');
  if (!builds.length) { wrap.classList.add('hidden'); return; }
  wrap.classList.remove('hidden');

  const estimated = builds.some(b => b.requirements.endoEstimated);
  const cards = [
    [Icon.bolt(18), t.forma,      'Forma',               null],
    [Icon.star(18), t.auraForma,  'Aura-Forma',          null],
    [Icon.star(18), t.umbraForma, 'Umbra-Forma',         null],
    [Icon.cube(18), t.reactor,    'Orokin-Reaktoren',    null],
    [Icon.cube(18), t.catalyst,   'Orokin-Katalysatoren', null],
    [Icon.coin(18), nf(t.endo),   'Endo',                estimated ? 'geschätzt' : 'laut Overframe']
  ].filter(c => c[1] !== 0 && c[1] !== '0');

  $('totals-grid').innerHTML = cards.map(([ic, val, label, note]) => `
    <div class="tcard">
      <span class="ticon">${ic}</span>
      <div><b>${esc(String(val))}</b><span>${esc(label)}</span>
      ${note ? `<small>${esc(note)}</small>` : ''}</div>
    </div>`).join('');
}

function renderMissingMods(list) {
  const wrap = $('missing-mods-wrap');
  if (!list.length) { wrap.classList.add('hidden'); return; }
  wrap.classList.remove('hidden');

  $('missing-mods').innerHTML = list.map(m => `
    <div class="modrow" data-mod="${esc(m.uniqueName)}">
      <span class="mcheck">${Icon.check(13)}</span>
      <div class="modrow-body">
        <b>${esc(m.name)}</b>
        <small>Rang ${m.rank}/${m.maxRank} · ${esc(m.usedIn.join(', '))}</small>
      </div>
      <span class="rarity ${esc(m.rarity)}">${esc(m.rarityLabel)}</span>
    </div>`).join('');

  $('missing-mods').querySelectorAll('[data-mod]').forEach(row => row.onclick = async () => {
    row.classList.add('owned');
    const r = await window.api.setModOwned(row.dataset.mod, true);
    if (r.ok) renderBuilds(r.data);
  });
}

$('btn-all-owned').onclick = async () => {
  const ids = [...$('missing-mods').querySelectorAll('[data-mod]')].map(r => r.dataset.mod);
  if (!ids.length) return;
  const r = await window.api.setManyModsOwned(ids, true);
  if (r.ok) renderBuilds(r.data);
};

/* ---------------- Checkliste ---------------- */
async function loadChecklist() {
  checklistCache = await window.api.getChecklist(null);
  const cats = [...new Set(checklistCache.map(i => i.category))].sort();
  $('filter-category').innerHTML = '<option value="">Alle Kategorien</option>' +
    cats.map(c => {
      const label = (checklistCache.find(i => i.category === c) || {}).label || c;
      return `<option value="${esc(c)}">${esc(label)}</option>`;
    }).join('');
  drawChecklist();
}

function drawChecklist() {
  const cat    = $('filter-category')?.value || '';
  const status = $('filter-status')?.value || '';
  const q      = ($('filter-search')?.value || '').toLowerCase().trim();

  const list = checklistCache.filter(i =>
    (!cat || i.category === cat) &&
    (!status || i.status === status) &&
    (!q || (i.name || '').toLowerCase().includes(q))
  );

  const inGoals = new Set((state?.goals || []).map(g => g.uniqueName));

  if ($('checklist-count')) $('checklist-count').textContent = nf(list.length) + ' Items';
  if ($('checklist')) {
    $('checklist').innerHTML = list.slice(0, 600).map(i => {
      const isGoal = inGoals.has(i.uniqueName);
      return `
      <div class="tile ${esc(i.status)} ${isGoal ? 'is-goal' : ''}" data-item-u="${esc(i.uniqueName)}">
        <span class="dot ${esc(i.status)}"></span>
        ${isGoal ? `<span class="tile-goal-badge" title="Aktives Farm-Ziel">${Icon.target(12)}</span>` : ''}
        <img src="${esc(i.image)}" alt="" onerror="this.style.visibility='hidden'">
        <div class="tile-name">${esc(i.name)}</div>
        <div class="tile-rank">${i.status === 'missing' ? 'Fehlt' : 'Rang ' + i.rank + ' / ' + i.maxLvl}</div>
      </div>`;
    }).join('');

    $('checklist').querySelectorAll('.tile').forEach(tile => {
      tile.onclick = () => openItemModal(tile.dataset.itemU);
    });
  }
}
['filter-category', 'filter-status', 'filter-search'].forEach(id => {
  if ($(id)) $(id).addEventListener('input', drawChecklist);
});

/* ---------------- Notizen ---------------- */
function renderNotes(data) {
  $('general-notes').value = data.generalNotes || '';
  const withNotes = data.goals.filter(g => g.note && g.note.trim());
  $('item-notes').innerHTML = withNotes.length
    ? withNotes.map(g => `<div class="itemnote"><b>${esc(g.name)}</b><p>${esc(g.note)}</p></div>`).join('')
    : '<div class="empty">Notizen an Zielen erscheinen hier.</div>';
}
let notesTimer;
$('general-notes').oninput = e => {
  clearTimeout(notesTimer);
  notesTimer = setTimeout(() => window.api.setGeneralNotes(e.target.value), 600);
};

/* ---------------- Item-Detail Modal ---------------- */
async function openItemModal(uniqueName) {
  if (!uniqueName) return;
  const modal = $('item-modal');
  const content = $('item-modal-content');
  if (!modal || !content) return;

  modal.classList.remove('hidden');
  content.innerHTML = `
    <div style="padding: 40px; text-align: center; color: var(--text-3);">
      ${Icon.refresh(22)}
      <div style="margin-top: 10px; font-size: 13px;">Lade Item-Details …</div>
    </div>
  `;

  const res = await window.api.getItemDetails(uniqueName);
  if (!res.ok) {
    content.innerHTML = `
      <div class="im-header">
        <h2>Fehler</h2>
        <button class="modal-close-icon" onclick="closeItemModal()">&times;</button>
      </div>
      <div class="im-scroll-body">
        <p style="color: var(--red);">${esc(res.error || 'Details konnten nicht geladen werden.')}</p>
      </div>
    `;
    return;
  }

  const d = res.data;
  const inGoals = (state?.goals || []).some(g => g.uniqueName === d.uniqueName);

  let statusText = 'Fehlt';
  if (d.status === 'done') statusText = 'Gemeistert';
  else if (d.status === 'partial') statusText = `Rang ${d.rank}/${d.maxLvl}`;

  content.innerHTML = `
    <div class="im-header">
      <div class="im-header-left">
        <div class="im-art-wrap">
          <img class="im-art" src="${esc(d.image)}" alt="" onerror="this.style.visibility='hidden'">
        </div>
        <div class="im-title-group">
          <div class="im-tags">
            <span class="im-badge cat">${esc(d.categoryLabel)}</span>
            ${d.masteryReq > 0 ? `<span class="im-badge mr">MR ${d.masteryReq}</span>` : ''}
            <span class="im-badge status ${esc(d.status)}">${statusText}</span>
          </div>
          <h2>${esc(d.name)}</h2>
          <div class="im-gain-hint">
            ${d.status === 'done'
              ? `<span class="gain-done">${Icon.check(13)} Vollständig gemeistert (+${nf(d.potentialXP)} XP)</span>`
              : (d.status === 'partial'
                  ? `<span class="gain-partial">${Icon.bolt(13)} Im Inventar (Rang ${d.rank}/${d.maxLvl}) · Noch +${nf(d.gain)} MR-XP</span>`
                  : `<span class="gain-missing">${Icon.target(13)} Nicht im Besitz · +${nf(d.potentialXP)} MR-XP</span>`
                )
            }
          </div>
        </div>
      </div>
      <div class="im-header-actions">
        <button id="im-goal-btn" class="btn ${inGoals ? 'btn-secondary' : 'btn-primary'}" data-u="${esc(d.uniqueName)}" data-name="${esc(d.name)}">
          ${inGoals ? Icon.trash(14) + ' <span>Aus Zielen entfernen</span>' : Icon.plus(14) + ' <span>Als Ziel setzen</span>'}
        </button>
      </div>
      <button class="modal-close-icon" id="im-close" title="Schließen">&times;</button>
    </div>

    <div class="im-scroll-body">
    ${d.description ? `
      <div class="im-section">
        <p class="im-desc">${esc(d.description)}</p>
      </div>
    ` : ''}

    ${d.stats && d.stats.length ? `
      <div class="im-section">
        <div class="im-section-title">Attribute & Werte</div>
        <div class="im-stats-grid">
          ${d.stats.map(s => `
            <div class="im-stat-tile">
              <span class="st-label">${esc(s.label)}</span>
              <b class="st-val">${esc(String(s.val))}</b>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}

    ${d.passiveDescription ? `
      <div class="im-section">
        <div class="im-section-title">Passive Fähigkeit</div>
        <div class="im-passive">${esc(d.passiveDescription)}</div>
      </div>
    ` : ''}

    ${d.abilities && d.abilities.length ? `
      <div class="im-section">
        <div class="im-section-title">Fähigkeiten</div>
        <div class="im-abilities">
          ${d.abilities.map((ab, i) => `
            <div class="im-ability">
              <div class="ab-num">${i + 1}</div>
              <div class="ab-content">
                <b>${esc(ab.name)}</b>
                <p>${esc(ab.description)}</p>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}

    <div class="im-section">
      <div class="im-section-title">Beschaffung & Fundort</div>
      <div class="im-source-box">
        <div class="im-source-label">${Icon.target(14)} <b>${esc(d.source)}</b></div>
        ${d.sourceNote ? `<div class="im-source-note">${esc(d.sourceNote)}</div>` : ''}
      </div>
    </div>

    ${d.components && d.components.length ? `
      <div class="im-section">
        <div class="im-section-title">Benötigte Bauteile & Komponenten</div>
        <div class="im-components-grid">
          ${d.components.map(c => `
            <div class="im-component-card ${c.isSubRecipe ? 'craftable' : ''}">
              <div class="im-comp-head">
                ${c.image ? `<img class="mat-icon" src="${esc(c.image)}" alt="" onerror="this.style.display='none'">` : ''}
                <div class="im-comp-info">
                  <div class="im-comp-title">
                    <b>${esc(c.name)}</b>
                    <span class="im-comp-count">${c.count}x</span>
                  </div>
                  <span class="im-comp-tag ${c.isSubRecipe ? '' : 'raw'}">
                    ${c.isSubRecipe ? 'Wird geschmiedet (12h)' : 'Ressource / Teil'}
                  </span>
                </div>
              </div>
              ${c.ingredients && c.ingredients.length ? `
                <div class="im-comp-submats">
                  ${c.ingredients.map(ing => `
                    <span class="im-subchip">
                      ${ing.image ? `<img class="mat-icon" src="${esc(ing.image)}" alt="" onerror="this.style.display='none'">` : ''}
                      <span>${esc(ing.name)}</span>
                      <b>${nf(ing.count)}</b>
                    </span>
                  `).join('')}
                </div>
              ` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}

    ${d.materials && d.materials.length ? `
      <div class="im-section">
        <div class="im-section-title">Gesamte Rohstoffe & Materialien</div>
        <div class="im-recipe-meta">
          <span>${Icon.coin(13)} <b>${nf(d.credits)}</b> Credits</span>
          <span>${Icon.clock(13)} <b>${esc(d.buildTime)}</b> Gesamtbauzeit</span>
        </div>
        <div class="im-mats-grid">
          ${d.materials.map(m => `
            <div class="im-mat">
              ${m.image ? `<img class="mat-icon" src="${esc(m.image)}" alt="" onerror="this.style.display='none'">` : ''}
              <span>${esc(m.name)}</span>
              <b>${nf(m.count)}</b>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}
    </div>
  `;

  $('im-close').onclick = closeItemModal;

  const goalBtn = $('im-goal-btn');
  if (goalBtn) {
    goalBtn.onclick = async () => {
      const u = goalBtn.dataset.u;
      const n = goalBtn.dataset.name;
      const already = (state?.goals || []).some(g => g.uniqueName === u);
      const res = already ? await window.api.removeGoal(u) : await window.api.addGoal(u, n);
      if (res.ok) {
        render(res.data);
        openItemModal(u);
      }
    };
  }
}

function closeItemModal() {
  const modal = $('item-modal');
  if (modal) modal.classList.add('hidden');
}

$('item-modal').onclick = e => {
  if (e.target === $('item-modal')) closeItemModal();
};

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeItemModal();
    closeSlotEditor();
  }
});

/* ---------------- Live World-State Tracker ---------------- */
let worldStateCache = null;
let activeFissureTier = 'all';
let worldStateTimer = null;

async function loadWorldState(force = false) {
  const btn = $('btn-refresh-worldstate');
  if (btn) {
    btn.disabled = true;
    btn.classList.add('is-refreshing');
    btn.innerHTML = Icon.refresh(14) + ' <span>Lade …</span>';
  }
  
  const data = await window.api.getWorldState(force);
  if (btn) {
    btn.disabled = false;
    btn.classList.remove('is-refreshing');
    btn.innerHTML = Icon.refresh(14) + ' <span>Neu laden</span>';
  }

  if (!data || data.error) {
    $('ws-cycles').innerHTML = `<div class="empty">Live-Daten konnten nicht geladen werden (${esc(data?.error || 'Netzwerkfehler')}).</div>`;
    return;
  }

  worldStateCache = data;
  renderWorldState(data);

  clearInterval(worldStateTimer);
  worldStateTimer = setInterval(() => {
    const activeTab = document.querySelector('.nav-item.active')?.dataset.tab;
    if (activeTab === 'worldstate') loadWorldState(false);
  }, 30000);
}

if ($('btn-refresh-worldstate')) {
  $('btn-refresh-worldstate').onclick = () => loadWorldState(true);
}

function renderWorldState(d) {
  // 1. Zyklen
  const c = d.cetus || {};
  const v = d.vallis || {};
  const cb = d.cambion || {};

  $('ws-cycles').innerHTML = `
    <div class="ws-cycle-card ${c.isDay ? 'day' : 'night'}">
      <div class="ws-cycle-head">
        <div>
          <div class="ws-cycle-title">Plains of Eidolon (Cetus)</div>
          <div class="ws-cycle-sub">Erde · Eidolon-Jagd</div>
        </div>
        <span class="ws-cycle-badge ${c.isDay ? 'day' : 'night'}">
          ${c.isDay ? Icon.sun(13) + ' Tag' : Icon.moon(13) + ' Nacht (Eidolon)'}
        </span>
      </div>
      <div class="ws-cycle-time">${esc(c.timeLeft || '—')} <small>verbleibend</small></div>
    </div>

    <div class="ws-cycle-card ${v.isWarm ? 'warm' : 'cold'}">
      <div class="ws-cycle-head">
        <div>
          <div class="ws-cycle-title">Orb Vallis (Fortuna)</div>
          <div class="ws-cycle-sub">Venus · Thermo-Zyklen</div>
        </div>
        <span class="ws-cycle-badge ${v.isWarm ? 'warm' : 'cold'}">
          ${v.isWarm ? Icon.flame(13) + ' Warm' : Icon.snowflake(13) + ' Kalt'}
        </span>
      </div>
      <div class="ws-cycle-time">${esc(v.timeLeft || '—')} <small>verbleibend</small></div>
    </div>

    <div class="ws-cycle-card ${cb.isFass ? 'warm' : 'night'}">
      <div class="ws-cycle-head">
        <div>
          <div class="ws-cycle-title">Cambion Drift (Deimos)</div>
          <div class="ws-cycle-sub">Deimos · Wurm-Zyklus</div>
        </div>
        <span class="ws-cycle-badge ${cb.state || 'fass'}">
          ${cb.isFass ? 'Fass (Orange)' : 'Vome (Blau)'}
        </span>
      </div>
      <div class="ws-cycle-time">${esc(cb.timeLeft || '—')} <small>verbleibend</small></div>
    </div>
  `;

  // 2. Baro Ki'Teer
  const vt = d.voidTrader || {};
  if (vt.active) {
    $('ws-voidtrader').innerHTML = `
      <div class="ws-trader-head">
        <div class="ws-trader-info">
          <h3>${esc(vt.character)} ist anwesend!</h3>
          <p>Standort: <b>${esc(vt.location)}</b> · Verlässt das Relais in <b>${esc(vt.endString || '2 Tagen')}</b></p>
        </div>
        <span class="ws-trader-status active">Jetzt im Relais</span>
      </div>
      ${vt.inventory && vt.inventory.length ? `
        <div class="ducats-catalog-list" style="margin-top: 14px;">
          ${vt.inventory.map(it => `
            <div class="ducat-item-row">
              <div class="ducat-item-body">
                <b>${esc(it.item)}</b>
                <span>${nf(it.credits)} Credits</span>
              </div>
              <span class="ducat-item-val">${Icon.ducat(13)} <b>${nf(it.ducats)}</b></span>
            </div>
          `).join('')}
        </div>
      ` : ''}
    `;
  } else {
    $('ws-voidtrader').innerHTML = `
      <div class="ws-trader-head">
        <div class="ws-trader-info">
          <h3>${esc(vt.character || "Baro Ki'Teer")} ist auf Reisen</h3>
          <p>Nächste Ankunft: <b>${esc(vt.location || 'Relais')}</b> in <b>${esc(vt.startString || 'wenigen Tagen')}</b></p>
        </div>
        <span class="ws-trader-status inactive">Countdown läuft</span>
      </div>
    `;
  }

  // 3. Sortie & Archon
  /* Restzeit nur anhaengen, wenn es eine gibt - sonst blieb hier ein
     angefangenes "Noch" ohne Wert stehen. */
  const restzeit = eta => (eta ? ` · Noch <b>${esc(eta)}</b>` : '');

  const sort = d.sortie;
  if (sort) {
    $('ws-sortie').innerHTML = `
      <div style="font-size: 12.5px; color: var(--text-2); margin-bottom: 8px;">
        Boss: <b style="color: var(--text);">${esc(sort.boss)}</b> (${esc(sort.faction)})${restzeit(sort.eta)}
      </div>
      ${(sort.variants || []).map((v, i) => `
        <div class="ws-mission-item">
          <div class="ws-m-num">${i + 1}</div>
          <div class="ws-m-info">
            <b>${esc(v.missionType)} (${esc(v.node)})</b>
            <p>${esc(v.modifier)}: ${esc(v.modifierDescription)}</p>
          </div>
        </div>
      `).join('')}
    `;
  } else {
    $('ws-sortie').innerHTML = '<div class="empty">Kein aktiver Einsatz gemeldet.</div>';
  }

  const arc = d.archonHunt;
  if (arc) {
    $('ws-archon').innerHTML = `
      <div style="font-size: 12.5px; color: var(--text-2); margin-bottom: 8px;">
        Ziel: <b style="color: var(--gold);">${esc(arc.boss)}</b>${restzeit(arc.eta)}
      </div>
      ${(arc.missions || []).map((m, i) => `
        <div class="ws-mission-item">
          <div class="ws-m-num">${i + 1}</div>
          <div class="ws-m-info">
            <b>${esc(m.type)}</b>
            <p>${esc(m.node)}</p>
          </div>
        </div>
      `).join('')}
    `;
  } else {
    $('ws-archon').innerHTML = '<div class="empty">Keine Archon-Jagd aktiv.</div>';
  }

  // 4. Void Fissures
  renderFissures(d.fissures || []);

  // 6. Neue Weltzustands-Abschnitte
  renderWsSource(d);
  renderWsNav(d.counts || {});
  renderAlerts(d);
  renderEvents(d.events || []);
  renderSteelPath(d.steelPath);
  renderInvasions(d.invasions || []);
  renderSyndicates(d.syndicates || []);
}

/* ---------------- Weltzustands-Leiste (wie in der Sternenkarte) ---------------- */

/**
 * Reihenfolge und Beschriftung wie im Spiel. icon 'img:x' nutzt ein Original-Asset
 * aus assets/icons/worldstate, 'svg:x' eine Vektorglyphe - fuer Event und Alerts
 * gibt das Wiki kein brauchbares weisses Icon her.
 */
const leerHinweis = text => `<div class="empty" style="grid-column: 1 / -1;">${esc(text)}</div>`;

/**
 * Unterseiten des Live-Trackers.
 *
 * Frueher stand alles untereinander auf einer sehr langen Seite. Die Leiste war
 * eine reine Sprungnavigation - jetzt schaltet sie echte Seiten um, damit man
 * nicht an Invasionen vorbeiscrollen muss, um zu den Rissen zu kommen.
 *
 * `count` nennt das Feld aus d.counts, das als Zahl am Reiter steht;
 * null bedeutet: dieser Bereich hat keine sinnvolle Anzahl.
 */
const WS_PANES = [
  { key: 'overview',   label: 'Übersicht',   icon: 'svg:globe',     count: null },
  { key: 'fissures',   label: 'Void-Risse',  icon: 'img:fissure',   count: 'fissures' },
  { key: 'missions',   label: 'Einsätze',    icon: 'img:sortie',    count: 'missions' },
  { key: 'alerts',     label: 'Alerts',      icon: 'img:quest',     count: 'alerts' },
  { key: 'events',     label: 'Operationen', icon: 'img:event',     count: 'events' },
  // Das Original-Asset (EliteAlertIcon) ist zu filigran und matscht bei 24px zu -
  // die Vektorglyphe zeigt dasselbe Symbol und bleibt scharf.
  { key: 'steelpath',  label: 'Steel Path',  icon: 'svg:alert',     count: 'steelPath' },
  { key: 'invasions',  label: 'Invasionen',  icon: 'img:invasion',  count: 'invasions' },
  { key: 'syndicates', label: 'Syndikate',   icon: 'img:syndicate', count: 'syndicates' }
];

let wsPane = 'overview';

function renderWsNav(counts) {
  const box = $('ws-nav');
  if (!box) return;
  box.innerHTML = WS_PANES.map(p => {
    const [kind, name] = p.icon.split(':');
    const ic = kind === 'img'
      ? `<span class="ws-stat-ic ic-${name}"></span>`
      : `<span class="ws-stat-ic is-svg">${Icon[name] ? Icon[name](18) : ''}</span>`;
    const n = p.count ? (counts[p.count] ?? 0) : null;
    return `<button class="ws-navtab${p.key === wsPane ? ' active' : ''}${n === 0 ? ' zero' : ''}"
              data-ws-go="${p.key}">${ic}<span>${esc(p.label)}</span>${
              n === null ? '' : `<b>${n}</b>`}</button>`;
  }).join('');
}

function showWsPane(key) {
  wsPane = key;
  document.querySelectorAll('.ws-pane').forEach(p =>
    p.classList.toggle('active', p.dataset.wsPane === key));
  document.querySelectorAll('.ws-navtab').forEach(t =>
    t.classList.toggle('active', t.dataset.wsGo === key));
  document.querySelector('.main-content')?.scrollTo({ top: 0, behavior: 'smooth' });
}

$('ws-nav')?.addEventListener('click', e => {
  const btn = e.target.closest('.ws-navtab');
  if (btn) showWsPane(btn.dataset.wsGo);
});

/**
 * Zustand der Datenquelle.
 *
 * warframestat.us faellt zeitweise aus oder liefert veraltete Staende. Ohne
 * diesen Hinweis sieht der Nutzer nur eine leere Riss-Liste und haelt es fuer
 * einen Fehler der App - genau das ist am 2026-08-20 passiert.
 */
function renderWsSource(d) {
  const box = $('ws-source');
  if (!box) return;

  const alterMin = d.sourceTimestamp
    ? Math.round((Date.now() - new Date(d.sourceTimestamp).getTime()) / 60000)
    : null;

  let art = null, text = '';
  if (d.error) {
    art = 'down';
    text = `Die Datenquelle (warframestat.us) antwortet nicht: ${d.error}. `
         + 'Angezeigt wird, was zuletzt geladen wurde – oder nichts.';
  } else if (alterMin !== null && alterMin > 15) {
    art = 'stale';
    const h = Math.floor(alterMin / 60), m = alterMin % 60;
    text = `Die Datenquelle hinkt ${h ? h + ' h ' : ''}${m} min hinterher. `
         + 'Abgelaufene Einträge werden ausgeblendet – deshalb können Listen leer wirken.';
  }

  box.classList.toggle('hidden', !art);
  if (!art) return;
  box.className = 'ws-source is-' + art;
  box.innerHTML = `<span class="ws-source-ic">${Icon.warning(16)}</span><span>${esc(text)}</span>`;
}

/* Alter Sprung-Zielcode - bleibt fuer den Fall, dass irgendwo noch data-target sitzt. */
$('ws-statusbar')?.addEventListener('click', e => {
  const btn = e.target.closest('.ws-stat');
  if (!btn) return;
  const id = btn.dataset.target;
  if (!id) return;
  const el = $(id);
  if (el && !el.classList.contains('hidden')) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});

/* ---------------- Alerts & zeitlich begrenzte Missionen ---------------- */

/* Farbe und Kurzname je Art. Kuva-Fluten und Elite-Aufgaben stechen heraus,
   weil sie die lohnendsten und seltensten Eintraege der Liste sind. */
const ALERT_ARTEN = {
  'kuva-flut':           { label: 'Kuva-Flut',      klasse: 'is-gold' },
  'kuva-siphon':         { label: 'Kuva-Siphon',    klasse: 'is-gold' },
  'arbitration':         { label: 'Schlichtung',    klasse: 'is-accent' },
  'nightwave-elite':     { label: 'Nightwave Elite',klasse: 'is-accent' },
  'nightwave':           { label: 'Nightwave',      klasse: '' },
  'nightwave-taeglich':  { label: 'Nightwave',      klasse: '' },
  'alert':               { label: 'Alert',          klasse: '' }
};

function renderAlerts(d) {
  const box = $('ws-alerts');
  if (!box) return;

  const list = d.alerts || [];
  if (!list.length) {
    box.innerHTML = leerHinweis(d.error
      ? 'Die Datenquelle antwortet gerade nicht – deshalb keine Einträge.'
      : 'Gerade läuft nichts Zeitlich-Begrenztes.');
    return;
  }

  box.innerHTML = list.map(a => {
    const art = ALERT_ARTEN[a.art] || ALERT_ARTEN.alert;
    const ort = [a.node, a.missionType].filter(Boolean).join(' · ');
    const stufe = a.minLevel && a.maxLevel ? ` · Stufe ${a.minLevel}–${a.maxLevel}` : '';
    return `
      <div class="ws-alert-card ${art.klasse}">
        <div class="ws-alert-head">
          <span class="ws-alert-art">${esc(art.label)}</span>
          ${a.eta ? `<span class="ws-alert-eta">${Icon.clock(12)} ${esc(a.eta)}</span>` : ''}
        </div>
        <b>${esc(a.titel || a.missionType || 'Mission')}</b>
        ${ort || stufe ? `<span class="ws-alert-ort">${esc(ort)}${esc(stufe)}</span>` : ''}
        ${a.beschreibung ? `<p>${esc(a.beschreibung)}</p>` : ''}
        ${a.reward ? `<span class="ws-alert-reward">${esc(a.reward)}</span>` : ''}
      </div>`;
  }).join('');
}

/* ---------------- Operationen / Events ---------------- */

/* Seit dem Umbau auf Unterseiten versteckt sich kein Bereich mehr selbst -
   eine leere Seite braucht eine Erklaerung, kein Verschwinden. */
function renderEvents(list) {
  if (!$('ws-events')) return;
  if (!list.length) {
    $('ws-events').innerHTML = leerHinweis('Zurzeit läuft keine Operation.');
    return;
  }

  $('ws-events').innerHTML = list.map(e => `
    <div class="ws-event-card">
      <div class="ws-event-head">
        <div>
          <b>${esc(e.name)}</b>
          <span>${esc(e.node || e.tooltip || '')}</span>
        </div>
        <span class="ws-eta">${esc(e.eta)}</span>
      </div>
      ${e.progress != null ? `
        <div class="ws-progress">
          <div class="ws-progress-fill" style="width:${e.progress}%"></div>
        </div>
        <div class="ws-progress-label">${e.progress}% abgeschlossen</div>` : ''}
      ${e.rewards.length ? `<div class="ws-event-rewards">${
        e.rewards.map(r => `<span>${esc(r)}</span>`).join('')}</div>` : ''}
    </div>`).join('');
}

/* ---------------- Steel Path ---------------- */

function renderSteelPath(sp) {
  if (!$('ws-steelpath')) return;
  if (!sp) {
    $('ws-steelpath').innerHTML = leerHinweis('Keine Steel-Path-Daten gemeldet.');
    return;
  }

  $('ws-steelpath').innerHTML = `
    <div class="ws-sp-row">
      <div class="ws-sp-reward">
        <span class="ws-sp-label">Teshins Angebot dieser Woche</span>
        <b>${esc(sp.rewardName || '—')}</b>
        ${sp.rewardCost != null ? `<span class="ws-sp-cost">${sp.rewardCost} Steel Essence</span>` : ''}
      </div>
      <div class="ws-sp-side">
        <span class="ws-eta">${esc(sp.remaining || '')}</span>
        <span class="ws-sp-inc ${sp.incursionsActive ? 'on' : 'off'}">
          ${sp.incursionsActive ? 'Incursions aktiv · ' + esc(sp.incursionsEta) : 'Keine Incursions'}
        </span>
      </div>
    </div>`;
}

/* ---------------- Invasionen ---------------- */

function renderInvasions(list) {
  if (!$('ws-invasions')) return;
  if (!list.length) {
    $('ws-invasions').innerHTML = leerHinweis('Zurzeit laufen keine Invasionen.');
    return;
  }

  $('ws-invasions').innerHTML = list.map(i => `
    <div class="ws-invasion-card">
      <div class="ws-inv-head">
        <b>${esc(i.node)}</b>
        <span>${esc(i.desc)}</span>
      </div>
      <div class="ws-inv-bar" title="${i.completion}% zugunsten ${esc(i.attacker)}">
        <div class="ws-inv-fill" style="width:${i.completion}%"></div>
      </div>
      <div class="ws-inv-sides">
        <div class="ws-inv-side">
          <span class="ws-inv-faction">${esc(i.attacker)}</span>
          <span class="ws-inv-reward">${esc(i.attackerReward || '—')}</span>
        </div>
        <div class="ws-inv-side right">
          <span class="ws-inv-faction">${esc(i.defender)}</span>
          <span class="ws-inv-reward">${esc(i.defenderReward || '—')}</span>
        </div>
      </div>
    </div>`).join('');
}

/* ---------------- Syndikate ---------------- */

function renderSyndicates(list) {
  if (!$('ws-syndicates')) return;
  if (!list.length) {
    $('ws-syndicates').innerHTML = leerHinweis('Keine Syndikats-Aufträge gemeldet.');
    return;
  }

  $('ws-syndicates').innerHTML = list.map(sy => {
    // Bounty-Syndikate liefern Jobs, die klassischen Fraktionen stattdessen Nodes.
    const count = sy.jobCount || sy.nodeCount;
    const what = sy.jobCount ? 'Aufträge' : 'Missionen';
    return `
      <div class="ws-syndicate-card">
        <div class="ws-syn-head">
          <b>${esc(sy.syndicate)}</b>
          <span class="ws-eta">${esc(sy.eta)}</span>
        </div>
        <div class="ws-syn-count">${count} ${what}</div>
      </div>`;
  }).join('');
}

function renderFissures(list) {
  const filtered = activeFissureTier === 'all'
    ? list
    : list.filter(f => f.tier.toLowerCase() === activeFissureTier.toLowerCase());

  $('ws-fissures').innerHTML = filtered.length
    ? filtered.map(f => {
      const isMatch = isFissureAlertMatch(f, notificationSettings);
      return `
      <div class="ws-fissure-card ${isMatch ? 'is-alert-match' : ''}">
        <span class="ws-fissure-tier ${esc(f.tier)}">${esc(f.tier)}</span>
        <div class="ws-fissure-info">
          <b>${esc(f.missionType)}${f.isHard ? ' <small style="color:var(--red); font-size:11px;">[Steel Path]</small>' : ''}${isMatch ? `<span class="fissure-alert-tag">${Icon.bell(11)} Alarm</span>` : ''}</b>
          <span>${esc(f.node)} · ${esc(f.enemy)}</span>
        </div>
        <span class="ws-fissure-eta">${esc(f.eta)}</span>
      </div>
    `;}).join('')
    : '<div class="empty" style="grid-column: 1 / -1;">Keine aktiven Risse für diesen Filter.</div>';
}

document.querySelectorAll('.fissure-tab').forEach(tab => {
  tab.onclick = () => {
    document.querySelectorAll('.fissure-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    activeFissureTier = tab.dataset.tier;
    if (worldStateCache) renderFissures(worldStateCache.fissures || []);
  };
});

/* ---------------- 2. Ressourcen & Farm-Guide ---------------- */
let farmGuideCache = [];
let fgSearchTimer;

async function loadFarmGuide(q = '') {
  farmGuideCache = await window.api.getFarmingGuide(q);
  renderFarmGuide(farmGuideCache);
}

function renderFarmGuide(list) {
  const grid = $('fg-grid');
  if (!grid) return;

  grid.innerHTML = list.length
    ? list.map(r => `
      <div class="fg-card">
        <div class="fg-head">
          <img class="mat-icon" src="${esc(r.image)}" alt="" onerror="this.style.display='none'">
          <div class="fg-title-info">
            <h3>${esc(r.name)}</h3>
            <span class="fg-cat-badge">${esc(r.category)}</span>
          </div>
        </div>
        <p style="font-size: 12.5px; color: var(--text-2); line-height: 1.4;">${esc(r.description)}</p>

        <div class="fg-planets">
          ${(r.planets || []).map(p => `<span class="fg-planet-tag">${esc(p)}</span>`).join('')}
        </div>

        <div class="fg-nodes">
          <b style="font-size: 11.5px; text-transform: uppercase; letter-spacing: .5px; color: var(--text-3);">Beste Farm-Knoten</b>
          ${(r.bestNodes || []).map(n => `
            <div class="fg-node-item">
              <div class="fg-node-head">
                <b>${esc(n.planet)} · ${esc(n.node)}</b>
                <span>${esc(n.type || '')}</span>
              </div>
              <div class="fg-node-desc">${esc(n.desc)}</div>
            </div>
          `).join('')}
        </div>

        <div class="fg-frames">
          <b>Empfohlene Frames / Setups:</b> ${(r.recommendedFrames || []).join(', ')}
        </div>

        ${r.tips ? `
          <div style="font-size: 11.5px; color: var(--gold); background: rgba(240, 184, 73, 0.08); padding: 8px 12px; border-radius: var(--r-sm);">
            💡 <b>Tipp:</b> ${esc(r.tips)}
          </div>
        ` : ''}
      </div>
    `).join('')
    : '<div class="empty" style="grid-column: 1 / -1;">Keine Ressourcen für diese Suche gefunden.</div>';
}

$('fg-search').oninput = e => {
  clearTimeout(fgSearchTimer);
  const q = e.target.value;
  fgSearchTimer = setTimeout(() => loadFarmGuide(q), 200);
};

function openFarmGuideFor(name) {
  if (!name) return;
  showTab('farmguide');
  $('fg-search').value = name;
  loadFarmGuide(name);
}

/* ---------------- 3. Baro Dukaten & Relikt-Helper ---------------- */
let ducatsData = null;
let ducatQuantities = new Map();

async function loadDucats() {
  if (!ducatsData) {
    ducatsData = await window.api.getDucatsData();
  }
  renderDucats();
}

function renderDucats() {
  if (!ducatsData) return;
  renderDucatsCatalog();
}

function renderDucatsCatalog() {
  const q = ($('ducat-search')?.value || '').toLowerCase().trim();
  const list = (ducatsData?.catalog || []).filter(it =>
    !q || it.name.toLowerCase().includes(q) || (it.parentItem && it.parentItem.toLowerCase().includes(q))
  );

  let totalDucats = 0;
  ducatQuantities.forEach((qty, name) => {
    const item = ducatsData?.catalog?.find(x => x.name === name);
    if (item) totalDucats += item.ducats * qty;
  });

  if ($('ducats-calc-total')) {
    $('ducats-calc-total').innerHTML = `${Icon.ducat(16)} <span>${nf(totalDucats)} Dukaten</span>`;
  }

  if ($('ducats-catalog')) {
    $('ducats-catalog').innerHTML = list.slice(0, 100).map(it => {
      const qty = ducatQuantities.get(it.name) || 0;
      return `
        <div class="ducat-item-row ${qty > 0 ? 'selected' : ''}">
          <img class="mat-icon" src="${esc(it.image)}" alt="" onerror="this.style.display='none'">
          <div class="ducat-item-body">
            <b>${esc(it.name)}</b>
            <span>${esc(it.parentItem || 'Prime')} · ${esc(it.rarity || '')}</span>
          </div>
          <span class="ducat-item-val">${Icon.ducat(13)} <b>${it.ducats}</b></span>
          <div class="ducat-item-counter">
            <button class="ducat-btn-cnt" data-dec="${esc(it.name)}">-</button>
            <span class="ducat-cnt-num">${qty}</span>
            <button class="ducat-btn-cnt" data-inc="${esc(it.name)}">+</button>
          </div>
        </div>
      `;
    }).join('');

    $('ducats-catalog').querySelectorAll('[data-inc]').forEach(btn => {
      btn.onclick = () => {
        const name = btn.dataset.inc;
        ducatQuantities.set(name, (ducatQuantities.get(name) || 0) + 1);
        renderDucatsCatalog();
      };
    });

    $('ducats-catalog').querySelectorAll('[data-dec]').forEach(btn => {
      btn.onclick = () => {
        const name = btn.dataset.dec;
        const cur = ducatQuantities.get(name) || 0;
        if (cur > 1) ducatQuantities.set(name, cur - 1);
        else ducatQuantities.delete(name);
        renderDucatsCatalog();
      };
    });
  }
}

$('ducat-search').oninput = () => renderDucatsCatalog();

/* ---------------- Inventar ---------------- */

let inventoryData = null;
let invSection = 'relics';

const QUELLEN = {
  api:        { label: 'Live-Abruf aus dem Spiel', stale: false },
  alecaframe: { label: 'AlecaFrame-Datei (Behelf)', stale: true }
};

/** "vor 3 Tagen" statt eines nackten Zeitstempels. */
function relativeAge(ts) {
  if (!ts) return 'unbekannt';
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 2) return 'gerade eben';
  if (min < 60) return `vor ${min} Minuten`;
  const h = Math.round(min / 60);
  if (h < 24) return `vor ${h} Stunde${h === 1 ? '' : 'n'}`;
  const d = Math.round(h / 24);
  return `vor ${d} Tag${d === 1 ? '' : 'en'}`;
}

async function loadInventoryTab() {
  if (inventoryData) return renderInventory();
  const res = await window.api.getInventory();
  if (res.ok) { inventoryData = res.data; renderInventory(); }
  else showInventoryState(res.code, res.error);
}

/** Ein Zustand statt einer Liste: nie abgerufen, Spiel aus, Drosselung, Fehler. */
function showInventoryState(code, text) {
  $('inv-body').classList.add('hidden');
  $('inv-source').classList.add('hidden');
  $('inv-notice').classList.add('hidden');
  const box = $('inv-state');
  box.classList.remove('hidden');

  const erklaerung = code === 'empty'
    ? 'Es liegen noch keine Inventardaten vor. Starte Warframe, logge dich ein und '
    + 'drücke auf „Inventar abrufen“ – die Zugangsdaten werden dabei nur aus dem '
    + 'laufenden Spiel gelesen und nirgends gespeichert.'
    : text;

  box.innerHTML = `
    <div class="inv-state-icon">${code === 'rate_limited' ? Icon.clock(30) : Icon.warning(30)}</div>
    <b>${esc(code === 'empty' ? 'Noch kein Inventar geladen' : 'Abruf nicht möglich')}</b>
    <p>${esc(erklaerung)}</p>`;
}

function renderInventory() {
  const d = inventoryData;
  if (!d) return;

  $('inv-state').classList.add('hidden');
  $('inv-body').classList.remove('hidden');

  /* Herkunft. Eine acht Tage alte Behelfsdatei darf nicht wie ein frischer
     Abruf aussehen - deshalb eigene Warnfarbe statt nur anderem Text. */
  const q = QUELLEN[d.source] || QUELLEN.api;
  const src = $('inv-source');
  src.classList.remove('hidden');
  src.className = 'inv-source' + (q.stale ? ' is-stale' : '');
  src.innerHTML = `
    <span class="inv-source-ic">${q.stale ? Icon.warning(15) : Icon.check(15)}</span>
    <div>
      <b>${esc(q.label)}</b>
      <span>Stand ${esc(relativeAge(d.fetchedAt))}${d.fetchedAt
        ? ' · ' + new Date(d.fetchedAt).toLocaleDateString('de-DE',
            { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''}${
        q.stale ? ' · zeigt nicht deinen aktuellen Bestand' : ''}</span>
    </div>
    ${d.gate.allowed ? '' :
      `<span class="inv-gate">${Icon.clock(13)} Nächster Abruf in ${esc(d.gate.waitText)}</span>`}`;

  /* Ein Abruf, der wegen der Drosselung nicht stattgefunden hat, darf nicht
     wortlos ins Leere laufen - sonst wirkt der Knopf kaputt. */
  const notice = $('inv-notice');
  notice.classList.toggle('hidden', !d.message);
  if (d.message) notice.innerHTML = `${Icon.clock(14)}<span>${esc(d.message)}</span>`;

  /* Waehrungen aendern sich staendig. Eine acht Tage alte Zahl gross und in Gold
     zu setzen laedt dazu ein, sie fuer den aktuellen Kontostand zu halten -
     deshalb bei veralteten Daten gedaempft, gestrichelt und mit Datum am Label. */
  const stand = d.fetchedAt
    ? new Date(d.fetchedAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
    : null;

  /* Waehrungen tragen die offiziellen Spielbilder statt Vektorglyphen: Credits,
     Platin und Endo erkennt man im Spiel genau an diesen drei Icons, waehrend
     Muenze, Stern und Blitz beliebig austauschbar wirken. */
  $('inv-currencies').className = 'inv-currencies' + (q.stale ? ' is-stale' : '');
  $('inv-currencies').innerHTML = [
    ['Credits', d.currencies.credits, 'credits'],
    ['Platin', d.currencies.platinum, 'platinum'],
    ['Endo', d.currencies.endo, 'endo']
  ].map(([label, value, icon]) => `
    <div class="inv-cur">
      <img class="inv-cur-ic" src="assets/icons/currency/${icon}.png" alt="">
      <div>
        <b>${nf(value)}</b>
        <span>${label}${q.stale && stand ? ' · Stand ' + esc(stand) : ''}</span>
      </div>
    </div>`).join('');

  $('inv-tabs').innerHTML = d.sectionMeta.map(s => `
    <button class="inv-tab ${s.key === invSection ? 'active' : ''}" data-inv="${s.key}">
      ${esc(s.label)}<span>${nf(d.totals[s.key].arten)}</span>
    </button>`).join('');

  $('inv-tabs').querySelectorAll('[data-inv]').forEach(btn => {
    btn.onclick = () => { invSection = btn.dataset.inv; renderInventory(); };
  });

  renderInventoryGrid();
}

function renderInventoryGrid() {
  const d = inventoryData;
  const query = ($('inv-search')?.value || '').toLowerCase().trim();
  const all = d.sections[invSection] || [];
  const list = query ? all.filter(e => e.name.toLowerCase().includes(query)) : all;

  const total = d.totals[invSection];
  const alt = (QUELLEN[d.source] || QUELLEN.api).stale && d.fetchedAt
    ? ` · Stand ${new Date(d.fetchedAt).toLocaleDateString('de-DE')}`
    : '';
  $('inv-meta').innerHTML = (query
    ? `${nf(list.length)} von ${nf(all.length)} Einträgen`
    : `${nf(total.arten)} Arten · ${nf(total.stueck)} Stück insgesamt`) + esc(alt);

  if (!list.length) {
    $('inv-grid').innerHTML = `<div class="empty">Nichts gefunden für „${esc(query)}“.</div>`;
    return;
  }

  /* Nur die ersten 300 zeichnen - bei 619 Mods mit Bild wird das Scrollen sonst zaeh. */
  const shown = list.slice(0, 300);
  $('inv-grid').innerHTML = shown.map(e => {
    const extra = e.quality ? `<span class="inv-tag">${esc(e.quality)}</span>`
      : e.ranks?.length ? `<span class="inv-tag">${e.ranks.map(r =>
          `Rang ${r.rank}${r.count > 1 ? '×' + r.count : ''}`).join(', ')}</span>`
      : '';
    return `
      <div class="inv-item" title="${esc(e.uniqueName)}">
        <img class="mat-icon" src="${esc(e.image)}" alt="" loading="lazy"
             onerror="this.classList.add('is-missing')">
        <div class="inv-item-body">
          <b>${esc(e.name)}</b>
          ${extra}
        </div>
        <span class="inv-item-count">${nf(e.count)}</span>
      </div>`;
  }).join('') + (list.length > shown.length
    ? `<div class="inv-more">… und ${nf(list.length - shown.length)} weitere. Nutze die Suche.</div>`
    : '');
}

if ($('inv-search')) $('inv-search').oninput = () => renderInventoryGrid();

if ($('btn-inv-refresh')) $('btn-inv-refresh').onclick = async () => {
  const btn = $('btn-inv-refresh');
  btn.disabled = true;
  btn.innerHTML = Icon.refresh(15) + '<span>Suche im Spielspeicher …</span>';

  const res = await window.api.refreshInventory();

  btn.disabled = false;
  btn.innerHTML = Icon.refresh(15) + '<span>Inventar abrufen</span>';

  if (res.ok) { inventoryData = res.data; renderInventory(); }
  else showInventoryState(res.code, res.error);
};

/* ---------------- Material Klick Verlinkung zum Farm-Guide ---------------- */
document.addEventListener('click', e => {
  const matEl = e.target.closest('.mat, .chip, .im-mat');
  if (matEl) {
    const nameEl = matEl.querySelector('span');
    if (nameEl && nameEl.textContent) {
      const name = nameEl.textContent.trim();
      if (farmGuideCache.some(r => r.name.toLowerCase() === name.toLowerCase()) || name.length > 2) {
        openFarmGuideFor(name);
      }
    }
  }
});

/* ==========================================================================
   Void-Riss Benachrichtigungssystem (Frontend)
   ========================================================================== */

/* Auswahl im Einstellungsfenster. Die Schluessel sind die Namen, die die API
   liefert - der Abgleich in fissure-filter.js vergleicht sie exakt.
   Die Zariman-Typen stehen zusammen oben, die Railjack-Typen unten: sie tauchen
   nur in Stuermen auf und haengen am Schalter "Stuerme einschliessen". */
const FISSURE_MISSION_TYPES = [
  { key: 'Void Cascade', label: 'Void Cascade (Kaskade)' },
  { key: 'Void Flood', label: 'Void-Flut (Flood)' },
  { key: 'Void Armageddon', label: 'Void-Armageddon' },
  { key: 'Capture', label: 'Gefangennahme (Capture)' },
  { key: 'Extermination', label: 'Auslöschung (Exterminate)' },
  { key: 'Survival', label: 'Überleben (Survival)' },
  { key: 'Defense', label: 'Verteidigung (Defense)' },
  { key: 'Mobile Defense', label: 'Mobile Verteidigung' },
  { key: 'Disruption', label: 'Störung (Disruption)' },
  { key: 'Excavation', label: 'Ausgrabung (Excavation)' },
  { key: 'Alchemy', label: 'Alchemie (Alchemy)' },
  { key: 'Rescue', label: 'Rettung (Rescue)' },
  { key: 'Spy', label: 'Spionage (Spy)' },
  { key: 'Interception', label: 'Abfangen (Interception)' },
  { key: 'Sabotage', label: 'Sabotage' },
  { key: 'Skirmish', label: 'Scharmützel (Railjack)' },
  { key: 'Volatile', label: 'Volatile (Railjack)' },
  { key: 'Orphix', label: 'Orphix (Railjack)' }
];

let notificationSettings = null;

/* Die Regeln stehen in fissure-filter.js - dieselbe Datei benutzt der
   Main-Prozess fuer die Toasts. Sonst markiert die Rissliste hier einen
   Treffer, fuer den nie eine Benachrichtigung kommt. */
function isFissureAlertMatch(f, cfg) {
  return FissureFilter.matches(f, cfg);
}

function updateNotificationButtonState() {
  const btn = $('btn-fissure-notif');
  const badge = $('fissure-notif-btn-badge');
  if (!btn || !badge) return;

  const active = !!(notificationSettings?.enabled && notificationSettings?.fissures?.enabled);
  btn.classList.toggle('is-active', active);
  badge.classList.toggle('is-off', !active);
  badge.textContent = active ? 'Aktiv' : 'Aus';
}

async function loadNotificationSettings() {
  try {
    notificationSettings = await window.api.getNotifications();
    updateNotificationButtonState();
  } catch (err) {
    console.error('Fehler beim Laden der Benachrichtigungseinstellungen:', err);
  }
}

function renderNotifTypesGrid() {
  const container = $('notif-types-grid');
  if (!container) return;

  const currentTypes = new Set((notificationSettings?.fissures?.missionTypes || []).map(t => t.toLowerCase()));
  const isAll = !!notificationSettings?.fissures?.allMissionTypes;

  container.innerHTML = FISSURE_MISSION_TYPES.map(t => {
    const isChecked = isAll || currentTypes.has(t.key.toLowerCase());
    return `
      <label class="type-checkbox-tile ${isChecked ? 'checked' : ''}">
        <input type="checkbox" value="${esc(t.key)}" class="notif-type-cb" ${isChecked ? 'checked' : ''}>
        <span>${esc(t.label)}</span>
      </label>
    `;
  }).join('');

  container.querySelectorAll('.notif-type-cb').forEach(cb => {
    cb.onchange = () => {
      cb.closest('.type-checkbox-tile')?.classList.toggle('checked', cb.checked);
      updateModalMatchesHint();
    };
  });
}

function updateModalMatchesHint() {
  const hintEl = $('notif-matches-hint');
  if (!hintEl) return;

  if (!worldStateCache?.fissures?.length) {
    hintEl.innerHTML = '<span>Keine Worldstate-Risse im Cache</span>';
    return;
  }

  // Temporäre Konfiguration aus Formularfeldern zusammenstellen
  const formCfg = getModalSettingsForm();
  const matches = (worldStateCache.fissures || []).filter(f => isFissureAlertMatch(f, formCfg));

  if (!formCfg.enabled || !formCfg.fissures.enabled) {
    hintEl.innerHTML = '<span style="color: var(--text-3);">Benachrichtigungen deaktiviert</span>';
  } else if (matches.length) {
    const topMatches = matches.slice(0, 3).map(m => `<b>${esc(m.tier)} ${esc(m.missionType)}</b> (${esc(m.node)})`).join(', ');
    hintEl.innerHTML = `<span>🎯 <b>${matches.length} passende Risse</b> jetzt aktiv: ${topMatches}</span>`;
  } else {
    hintEl.innerHTML = '<span>Aktuell <b>keine Treffer</b> bei den gewählten Filtern</span>';
  }
}

function getModalSettingsForm() {
  const enabled = $('notif-fissures-enabled')?.checked ?? true;
  const sound = $('notif-sound-enabled')?.checked ?? true;
  const desktopToast = $('notif-desktop-enabled')?.checked ?? true;

  const selectedTiers = Array.from(document.querySelectorAll('.notif-tier-cb:checked')).map(cb => cb.value);
  const selectedTypes = Array.from(document.querySelectorAll('.notif-type-cb:checked')).map(cb => cb.value);

  const steelPathOnly = $('notif-steel-path-only')?.checked ?? false;
  const includeSteelPath = $('notif-include-steel-path')?.checked ?? true;
  const includeStorms = $('notif-include-storms')?.checked ?? true;

  return {
    enabled,
    sound,
    desktopToast,
    fissures: {
      enabled,
      allMissionTypes: false,
      missionTypes: selectedTypes,
      tiers: selectedTiers,
      steelPathOnly,
      includeSteelPath,
      includeStorms
    }
  };
}

function openNotificationModal() {
  const modal = $('fissure-notif-modal');
  if (!modal) return;

  const fCfg = notificationSettings?.fissures || {};

  if ($('notif-fissures-enabled')) $('notif-fissures-enabled').checked = notificationSettings?.enabled !== false && fCfg.enabled !== false;
  if ($('notif-sound-enabled')) $('notif-sound-enabled').checked = notificationSettings?.sound !== false;
  if ($('notif-desktop-enabled')) $('notif-desktop-enabled').checked = notificationSettings?.desktopToast !== false;

  if ($('notif-steel-path-only')) $('notif-steel-path-only').checked = !!fCfg.steelPathOnly;
  if ($('notif-include-steel-path')) $('notif-include-steel-path').checked = fCfg.includeSteelPath !== false;
  if ($('notif-include-storms')) $('notif-include-storms').checked = fCfg.includeStorms !== false;

  // Tiers
  const currentTiers = new Set((fCfg.tiers || ['Lith', 'Meso', 'Neo', 'Axi', 'Requiem', 'Omnia']).map(t => t.toLowerCase()));
  document.querySelectorAll('.notif-tier-cb').forEach(cb => {
    cb.checked = currentTiers.has(cb.value.toLowerCase());
    cb.closest('.tier-checkbox-tile')?.classList.toggle('checked', cb.checked);
    cb.onchange = () => {
      cb.closest('.tier-checkbox-tile')?.classList.toggle('checked', cb.checked);
      updateModalMatchesHint();
    };
  });

  // Mission Types
  renderNotifTypesGrid();
  updateModalMatchesHint();

  modal.classList.remove('hidden');
}

function closeNotificationModal() {
  const modal = $('fissure-notif-modal');
  if (modal) modal.classList.add('hidden');
}

// Preset-Buttons
function applyNotifPreset(name) {
  if (name === 'cascade') {
    document.querySelectorAll('.notif-type-cb').forEach(cb => {
      cb.checked = cb.value === 'Void Cascade';
      cb.closest('.type-checkbox-tile')?.classList.toggle('checked', cb.checked);
    });
    document.querySelectorAll('.notif-tier-cb').forEach(cb => {
      cb.checked = true;
      cb.closest('.tier-checkbox-tile')?.classList.add('checked');
    });
  } else if (name === 'speed') {
    document.querySelectorAll('.notif-type-cb').forEach(cb => {
      cb.checked = ['Capture', 'Extermination', 'Rescue'].includes(cb.value);
      cb.closest('.type-checkbox-tile')?.classList.toggle('checked', cb.checked);
    });
  } else if (name === 'endless') {
    document.querySelectorAll('.notif-type-cb').forEach(cb => {
      cb.checked = ['Void Cascade', 'Survival', 'Defense', 'Disruption', 'Excavation', 'Alchemy'].includes(cb.value);
      cb.closest('.type-checkbox-tile')?.classList.toggle('checked', cb.checked);
    });
  } else if (name === 'all') {
    document.querySelectorAll('.notif-type-cb').forEach(cb => {
      cb.checked = true;
      cb.closest('.type-checkbox-tile')?.classList.add('checked');
    });
  }
  updateModalMatchesHint();
}

// Event Listeners für Modal
$('btn-fissure-notif')?.addEventListener('click', openNotificationModal);
$('fissure-notif-close')?.addEventListener('click', closeNotificationModal);
$('fissure-notif-modal')?.addEventListener('click', e => {
  if (e.target === $('fissure-notif-modal')) closeNotificationModal();
});

document.querySelectorAll('.preset-chip').forEach(btn => {
  btn.onclick = () => applyNotifPreset(btn.dataset.preset);
});

$('notif-toggle-all-types')?.addEventListener('click', () => {
  const cbs = Array.from(document.querySelectorAll('.notif-type-cb'));
  const anyUnchecked = cbs.some(c => !c.checked);
  cbs.forEach(c => {
    c.checked = anyUnchecked;
    c.closest('.type-checkbox-tile')?.classList.toggle('checked', anyUnchecked);
  });
  updateModalMatchesHint();
});

$('notif-fissures-enabled')?.addEventListener('change', updateModalMatchesHint);
$('notif-steel-path-only')?.addEventListener('change', updateModalMatchesHint);
$('notif-include-steel-path')?.addEventListener('change', updateModalMatchesHint);
$('notif-include-storms')?.addEventListener('change', updateModalMatchesHint);

$('btn-notif-test')?.addEventListener('click', async () => {
  const btn = $('btn-notif-test');
  btn.disabled = true;
  btn.innerHTML = Icon.refresh(14) + ' <span>Sende Test …</span>';
  try {
    await window.api.testNotification();
  } catch (err) {
    console.error('Test-Notification error:', err);
  }
  setTimeout(() => {
    btn.disabled = false;
    btn.innerHTML = Icon.bell(14) + ' <span>Test senden</span>';
  }, 1200);
});

$('btn-notif-save')?.addEventListener('click', async () => {
  const formCfg = getModalSettingsForm();
  const res = await window.api.saveNotifications(formCfg);
  if (res.ok) {
    notificationSettings = res.data;
    updateNotificationButtonState();
    if (worldStateCache) renderFissures(worldStateCache.fissures || []);
  }
  closeNotificationModal();
});

// In-App Toast
function showInAppToast({ title, body, fissure }) {
  const container = $('app-toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'app-toast';
  toast.innerHTML = `
    <div class="toast-ic">${Icon.bell(16)}</div>
    <div class="toast-body">
      <b>${esc(title)}</b>
      <p>${esc(body).replace(/\n/g, '<br>')}</p>
    </div>
    <button class="toast-close" title="Schließen">&times;</button>
  `;

  const remove = () => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 250);
  };

  toast.onclick = e => {
    if (e.target.closest('.toast-close')) {
      e.stopPropagation();
      remove();
      return;
    }
    showTab('worldstate');
    showWsPane('fissures');
    remove();
  };

  container.appendChild(toast);
  setTimeout(remove, 6500);
}

// IPC Ereignisse empfangen
window.api.onNotificationEvent(data => {
  showInAppToast(data);
  if (worldStateCache) renderFissures(worldStateCache.fissures || []);
});

window.api.onNavigateTab((tab, subpane) => {
  showTab(tab);
  if (tab === 'worldstate' && subpane) showWsPane(subpane);
});

/* ---------------- App Start ---------------- */
loadNotificationSettings();
boot();


