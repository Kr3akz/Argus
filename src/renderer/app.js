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
/* Wird nach jeder Aenderung im Einstellungs-Tab erneut aufgerufen - sonst
   zeigt die Leiste eine Taste an, die gar nicht mehr registriert ist. */
function renderHotkeyHint(hk) {
  const el = $('hotkey-hint');
  if (!el || !hk || !hk.overlay) return;
  el.innerHTML = hk.overlay.split('+').map(k => `<kbd>${esc(k)}</kbd>`).join('');
  el.title = `${hk.overlay}: Overlay ein- und ausblenden\n${hk.interact}: Mauszeiger ins Overlay holen`;
  el.classList.remove('hidden');
}

window.api.overlayHotkey().then(renderHotkeyHint).catch(() => {});
$('btn-min').innerHTML     = Icon.minus(15);
$('btn-close').innerHTML   = Icon.close(15);
if ($('ic-goalsearch')) $('ic-goalsearch').innerHTML   = Icon.search(16);
if ($('ic-filtersearch')) $('ic-filtersearch').innerHTML = Icon.search(16);
if ($('ic-buildimport')) $('ic-buildimport').innerHTML  = Icon.link(16);
if ($('ic-modsearch')) $('ic-modsearch').innerHTML    = Icon.search(16);
if ($('ic-fgsearch')) $('ic-fgsearch').innerHTML     = Icon.search(16);
if ($('ic-ducatsearch')) $('ic-ducatsearch').innerHTML  = Icon.search(16);
if ($('ic-baro-kaufkraft')) $('ic-baro-kaufkraft').innerHTML = Icon.baro(36);
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
  /* Mastery Manager und Farm-Ziele sind ein Reiter mit zwei Modi. Aeltere
     Namen zeigen weiter dorthin, damit Aufrufe von aussen nicht ins Leere
     laufen - 'checklist' und 'goals' schalten dabei auf den Katalog. */
  if (name === 'checklist' || name === 'goals') { name = 'mastery'; masteryMode = 'catalog'; }
  if (name === 'dashboard') { name = 'mastery'; masteryMode = 'manager'; }
  document.querySelectorAll('.nav-item').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.tabpane').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));
  if (name === 'mastery') {
    if (!checklistCache.length) loadChecklist();
    if (state) renderGoals(state);
    applyMasteryMode();
  }
  if (name === 'builds' && !buildsLoaded) loadBuilds();
  if (name === 'worldstate') loadWorldState();
  if (name === 'farmguide') loadFarmGuide();
  if (name === 'ducats') loadDucats();
  if (name === 'inventory') loadInventoryTab();
  if (name === 'settings') loadSettingsTab();
}

document.querySelectorAll('.nav-item').forEach(tab => {
  tab.onclick = () => showTab(tab.dataset.tab);
});

/* ---------------- Mastery: Manager <-> Katalog ---------------- */
let masteryMode = 'manager';   // 'manager' | 'catalog'

const MASTERY_HINTS = {
  manager: 'Ziele, Rohstoffe & Mastery-Empfehlungen',
  catalog: 'Alle Items durchsuchen und als Ziel setzen'
};

function applyMasteryMode() {
  $('tab-mastery-mode-manager')?.classList.toggle('active', masteryMode === 'manager');
  $('tab-mastery-mode-catalog')?.classList.toggle('active', masteryMode === 'catalog');
  $('mastery-pane-manager')?.classList.toggle('active', masteryMode === 'manager');
  $('mastery-pane-catalog')?.classList.toggle('active', masteryMode === 'catalog');
  const hint = $('mastery-mode-hint');
  if (hint) hint.textContent = MASTERY_HINTS[masteryMode] || '';
  if (masteryMode === 'catalog' && !checklistCache.length) loadChecklist();
}

function setMasteryMode(mode) {
  masteryMode = mode;
  applyMasteryMode();
}

$('tab-mastery-mode-manager')?.addEventListener('click', () => setMasteryMode('manager'));
$('tab-mastery-mode-catalog')?.addEventListener('click', () => setMasteryMode('catalog'));

/* Der Knopf im Kopf springt zu den ausfuehrlichen Zielkarten - die liegen im
   Manager, also erst umschalten und dann dorthin scrollen. */
function setGoalDetailsOpen(open) {
  $('btn-goal-details')?.setAttribute('aria-expanded', String(open));
  $('goals')?.classList.toggle('hidden', !open);
}

$('btn-goal-details')?.addEventListener('click', () => {
  const open = $('btn-goal-details').getAttribute('aria-expanded') === 'true';
  setGoalDetailsOpen(!open);
});

function jumpToGoalDetails() {
  masteryMode = 'manager';
  showTab('mastery');
  setGoalDetailsOpen(true);
  /* Erst wenn der Manager wirklich sichtbar ist, hat das Ziel eine Position. */
  requestAnimationFrame(() =>
    $('goal-details-head')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}
if ($('btn-to-goals')) $('btn-to-goals').onclick = jumpToGoalDetails;

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
  loadWorldState();
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
  const goalDetailsCount = $('goal-details-count');
  if (goalDetailsCount) goalDetailsCount.textContent = (data.goals || []).length;
  const openGoalCount = (data.goals || []).filter(g => !g.done).length;
  const goalCountEl = $('goal-count');
  if (goalCountEl) {
    goalCountEl.textContent = openGoalCount;
    goalCountEl.classList.toggle('hidden', openGoalCount === 0);
  }
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

const CAT_ICONS = {
  Suits: 'catWarframe',
  SpaceSuits: 'catArchwing',
  MechSuits: 'catNecramech',
  Sentinels: 'catCompanion',
  KubrowPets: 'catCompanion',
  KDrive: 'catArchwing',
  Plexus: 'catWarframe',
  LongGuns: 'catPrimary',
  Pistols: 'catSecondary',
  Melee: 'catMelee',
  SpaceGuns: 'catPrimary',
  SpaceMelee: 'catMelee',
  SentinelWeapons: 'catCompanion',
  AmpPrism: 'catAmp',
  ZawStrike: 'catMelee',
  KitgunChamber: 'catSecondary'
};

function renderCategories(cats) {
  $('categories').innerHTML = cats.map(c => {
    const pct = c.total ? (c.done / c.total * 100) : 0;
    const icKey = CAT_ICONS[c.category] || 'catWarframe';
    const ic = Icon[icKey] ? Icon[icKey](16) : '';
    return `<div class="catrow">
      <span class="cat-label-wrap">${ic}<span>${esc(c.label)}</span></span>
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
    el.innerHTML = '<div class="empty">Noch keine Ziele gesetzt. Wechsle oben auf <b>Katalog</b>, wähle ein Item und klicke auf „Als Ziel setzen“.</div>';
    /* Ohne Ziele ist dieser Hinweis der einzige Wegweiser - der darf nicht
       hinter einem zugeklappten Abschnitt verschwinden. */
    setGoalDetailsOpen(true);
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
  if ($('build-count')) $('build-count').textContent = data.builds.length;
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
    closeUpgradeModal();
    closeRelicModal();
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
              <span class="ducat-item-val"><img class="currency-ic ducat-ic" src="assets/icons/ducats.png" alt="Dukaten"> <b>${nf(it.ducats)}</b></span>
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
  renderNightwave(d.nightwave || []);
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
  { key: 'nightwave',  label: 'Nightwave',   icon: 'img:nightwave', count: 'nightwave' },
  { key: 'alerts',     label: 'Alerts',      icon: 'img:quest',     count: 'alerts' },
  { key: 'events',     label: 'Operationen', icon: 'img:event',     count: 'events' },
  { key: 'steelpath',  label: 'Steel Path',  icon: 'img:steelpath', count: 'steelPath' },
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
/* ---------------- Nightwave ---------------- */

const NW_ARTEN = {
  'nightwave-elite':    { label: 'Elite-Wochenaufgabe', klasse: 'is-accent' },
  'nightwave':          { label: 'Wochenaufgabe',       klasse: 'is-gold' },
  'nightwave-taeglich': { label: 'Tagesaufgabe',        klasse: '' }
};

function renderNightwave(list) {
  const box = $('ws-nightwave');
  if (!box) return;

  const items = Array.isArray(list) ? list : [];
  if (!items.length) {
    box.innerHTML = leerHinweis('Zurzeit sind keine Nightwave-Aufgaben aktiv.');
    return;
  }

  box.innerHTML = items.map(nw => {
    const art = NW_ARTEN[nw.art] || { label: nw.missionType || 'Aufgabe', klasse: '' };
    return `
      <div class="ws-alert-card ws-nw-card ${art.klasse}">
        <div class="ws-alert-head">
          <span class="ws-alert-art">${esc(art.label)}</span>
          ${nw.eta ? `<span class="ws-alert-eta">${Icon.clock(12)} ${esc(nw.eta)}</span>` : ''}
        </div>
        <b>${esc(nw.titel || 'Nightwave')}</b>
        ${nw.beschreibung ? `<p class="ws-nw-desc">${esc(nw.beschreibung)}</p>` : ''}
        ${nw.reward ? `<div class="ws-nw-reward"><span class="ws-nw-badge">${esc(nw.reward)}</span></div>` : ''}
      </div>`;
  }).join('');
}

/* ---------------- Alerts, Kuva & Schlichtung ---------------- */

const ALERT_ARTEN = {
  'kuva-flut':    { label: 'Kuva-Flut',   klasse: 'is-gold' },
  'kuva-siphon':  { label: 'Kuva-Siphon', klasse: 'is-gold' },
  'arbitration':  { label: 'Schlichtung', klasse: 'is-accent' },
  'alert':        { label: 'Alert',       klasse: '' }
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

const RELIC_TIER_IMAGES = {
  lith: 'assets/icons/worldstate/relic-lith.png',
  meso: 'assets/icons/worldstate/relic-meso.png',
  neo: 'assets/icons/worldstate/relic-neo.png',
  axi: 'assets/icons/worldstate/relic-axi.png',
  requiem: 'assets/icons/worldstate/relic-requiem.png',
  omnia: 'assets/icons/worldstate/relic-omnia.png'
};

function relicTierImage(tier) {
  const t = String(tier || '').toLowerCase();
  return RELIC_TIER_IMAGES[t] || 'assets/icons/worldstate/relic-lith.png';
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
        <img class="ws-fissure-img" src="${relicTierImage(f.tier)}" alt="${esc(f.tier)}" onerror="this.style.display='none'">
        <div class="ws-fissure-info">
          <div class="ws-fissure-head-row">
            <span class="ws-fissure-tier ${esc(f.tier)}">${esc(f.tier)}</span>
            <b>${esc(f.missionType)}${f.isHard ? ' <small style="color:var(--red); font-size:11px;">[Steel Path]</small>' : ''}${isMatch ? `<span class="fissure-alert-tag">${Icon.bell(11)} Alarm</span>` : ''}</b>
          </div>
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
            <span class="tip-ic">${Icon.bulb(13)}</span><b>Tipp:</b> ${esc(r.tips)}
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
let sellQuantities = new Map(); // slug -> count
let currentSelectionPreset = 'all'; // 'all' | 'duplicates' | 'custom' | 'none'
let ducatsMode = 'inventory';    // 'inventory' | 'catalog' | 'sets' | 'plan'
let planTier = 'all';            // Aera-Filter des Planers
let planSort = 'plat-desc';      // Sortierung des Planers
let planOnlyTracked = false;     // nur die gemerkten Relikte zeigen
let trackedRelicIds = new Set(); // "Lith V1|Radiant" der gemerkten Relikte
let ducatsFilter = 'all';        // 'all' | 'advice-junk' | 'advice-plat' | '100' | '45' | '15'
let ducatsSort = 'ducats-desc';   // 'ducats-desc' | 'plat-desc' | 'ratio-desc' | 'count-desc' | 'name-asc'
let isFetchingDucatPrices = false;

function updateSelectionPresetButtons() {
  $('btn-ducats-select-all')?.classList.toggle('active', currentSelectionPreset === 'all');
  $('btn-ducats-select-dups')?.classList.toggle('active', currentSelectionPreset === 'duplicates');
}

async function loadDucats() {
  const res = await window.api.getDucatsData();
  ducatsData = res;
  trackedRelicIds = new Set((res?.trackedRelics || []).map(t => t.id));

  // Wenn noch keine Mengen gewählt wurden und Inventar vorliegt: alles vorselektieren
  if (sellQuantities.size === 0 && ducatsData?.inventory?.items?.length > 0) {
    currentSelectionPreset = 'all';
    for (const it of ducatsData.inventory.items) {
      if (it.count > 0) sellQuantities.set(it.slug, it.count);
    }
  }

  // Modus umschalten, falls kein Inventar vorhanden ist
  if (!ducatsData?.inventory?.items?.length && ducatsMode === 'inventory') {
    ducatsMode = 'catalog';
  }

  renderDucats();
  initDucatsEventListeners();

  // Fehlende Preise im Hintergrund automatisch nachladen
  fetchMissingDucatPrices();
}

async function fetchMissingDucatPrices(forceAll = false) {
  if (isFetchingDucatPrices || !ducatsData) return;

  let missingSlugs;

  if (ducatsMode === 'plan') {
    /* Ohne Preise ist der Erwartungswert nur die halbe Auskunft - hier wird
       deshalb genau das nachgeladen, was in den Tabellen steht. */
    const wanted = [];
    for (const relic of ducatsData.relicPlan || []) {
      for (const w of relic.rewards) {
        if (w.slug && (forceAll || w.plat == null)) wanted.push(w.slug);
      }
    }
    missingSlugs = [...new Set(wanted)];
  } else if (ducatsMode === 'sets') {
    /* Das Set-Item traegt einen eigenen Preis - die Summe der Teile ist etwas
       anderes und liegt regelmaessig hoeher als das fertige Set. */
    const wanted = [];
    for (const set of ducatsData.sets || []) {
      if (set.setSlug && (forceAll || !set.setPrice)) wanted.push(set.setSlug);
      for (const p of set.parts) {
        if (p.count > 0 && (forceAll || !p.price)) wanted.push(p.slug);
      }
    }
    missingSlugs = [...new Set(wanted)].filter(Boolean);
  } else {
    const targetItems = (ducatsMode === 'inventory' ? ducatsData.inventory?.items : ducatsData.catalog) || [];
    missingSlugs = targetItems
      .filter(it => forceAll || !it.price || it.price.min == null)
      .map(it => it.slug)
      .filter(Boolean);
  }

  if (!missingSlugs.length) return;

  isFetchingDucatPrices = true;
  updateDucatsPriceButtonState(true);

  try {
    const BATCH_SIZE = 10;
    for (let i = 0; i < missingSlugs.length; i += BATCH_SIZE) {
      const batch = missingSlugs.slice(i, i + BATCH_SIZE);
      const newPrices = await window.api.fetchDucatPrices(batch);

      applyDucatPrices(newPrices);
      renderDucatsKPIs();
      renderDucatsCatalog();
    }
  } catch (err) {
    console.error('Fehler beim Nachladen der Platin-Preise:', err);
  } finally {
    isFetchingDucatPrices = false;
    updateDucatsPriceButtonState(false);
  }
}

function applyDucatPrices(priceMap) {
  if (!priceMap || !ducatsData) return;

  function updateItem(it) {
    if (priceMap[it.slug]) {
      it.price = priceMap[it.slug];
      const price = it.price;
      if (price && typeof price.min === 'number' && price.min > 0) {
        const ratio = +(it.ducats / price.min).toFixed(1);
        if (price.min >= 15 || ratio < 7.0) {
          it.tradeAdvice = { advice: 'plat', ratio, label: 'Platin-Verkauf', reason: `${price.min}p Mindestpreis auf warframe.market` };
        } else if (ratio >= 10.0) {
          it.tradeAdvice = { advice: 'ducats', ratio, label: 'Prime Junk', reason: `${ratio} Dukaten pro Platin (hoher Schmelzwert)` };
        } else {
          it.tradeAdvice = { advice: 'balanced', ratio, label: 'Ausgeglichen', reason: `${ratio} Dukaten pro Platin` };
        }
      }
    }
  }

  (ducatsData.inventory?.items || []).forEach(updateItem);
  (ducatsData.catalog || []).forEach(updateItem);

  /* Die Relikt-Karten rechnen mit denselben Preisen, stehen aber in einer
     eigenen Liste - ohne diese Runde blieben ihre Erwartungswerte auf dem
     Stand des Programmstarts, waehrend die Teileliste daneben schon frische
     Zahlen zeigt. */
  for (const relic of ducatsData.relicPlan || []) {
    let touched = false;
    for (const w of relic.rewards || []) {
      if (w.slug && priceMap[w.slug] !== undefined) {
        w.plat = priceMap[w.slug]?.min ?? null;
        touched = true;
      }
    }
    if (!touched) continue;

    /* Dieselbe Rechnung wie in core/relics.js: Chance mal Wert, und der
       Anteil der Chance, fuer den ueberhaupt ein Preis vorliegt. */
    let expPlat = 0, priced = 0, total = 0;
    for (const w of relic.rewards || []) {
      const chance = w.chance || 0;
      total += chance;
      if (w.plat != null) { expPlat += chance / 100 * w.plat; priced += chance; }
    }
    relic.expPlat = Math.round(expPlat * 10) / 10;
    relic.pricedShare = total ? priced / total : 0;
  }
}

function renderDucats() {
  if (!ducatsData) return;
  renderDucatsStatusBar();
  renderDucatsKPIs();
  updateDucatsModeTabs();
  updateSelectionPresetButtons();
  renderDucatsCatalog();
}

function renderDucatsStatusBar() {
  const bar = $('ducats-status-bar');
  if (!bar) return;

  const hasInv = ducatsData.hasInventory && ducatsData.inventory?.items?.length > 0;

  /* Nur der Warnfall bekommt einen Balken. Dass ein Inventar DA ist, sieht man
     an den Zahlen darunter - dafuer braucht es keine gruene Leiste, die auf
     Dauer nur Platz kostet und nichts entscheidet. */
  if (hasInv) { bar.className = 'ducats-status-bar hidden'; return; }

  bar.className = 'ducats-status-bar bar-warning';
  bar.innerHTML = `
    <span class="status-dot warning"></span>
    <span><b>Kein aktives Inventar:</b> Starte Warframe und klicke im Inventar-Tab auf „Inventar abrufen“, um dein Konto automatisch zu scannen. Aktuell wird der Gesamtkatalog angezeigt.</span>
  `;
}

function renderDucatsKPIs() {
  if (!ducatsData) return;

  let selectedDucats = 0;
  let selectedPlatMin = 0;
  let selectedPlatMed = 0;
  let selectedItemsCount = 0;

  const allItems = [...(ducatsData.inventory?.items || []), ...(ducatsData.catalog || [])];
  const itemMap = new Map();
  for (const it of allItems) {
    if (!itemMap.has(it.slug)) itemMap.set(it.slug, it);
  }

  sellQuantities.forEach((qty, slug) => {
    if (qty <= 0) return;
    const item = itemMap.get(slug);
    if (!item) return;

    selectedDucats += item.ducats * qty;
    selectedItemsCount += qty;

    if (item.price?.min != null) {
      selectedPlatMin += item.price.min * qty;
      selectedPlatMed += (item.price.median || item.price.min) * qty;
    }
  });

  // KPI 1: Ausgewählte Dukaten
  if ($('ducats-selected-total')) $('ducats-selected-total').textContent = nf(selectedDucats);
  if ($('ducats-selected-sub')) {
    const totalInv = ducatsData.inventory?.summary?.totalItems || 0;
    let presetLabel = '';
    if (currentSelectionPreset === 'all') presetLabel = ' · Alle gewählt';
    else if (currentSelectionPreset === 'duplicates') presetLabel = ' · Duplikate gewählt';
    else if (currentSelectionPreset === 'none' || selectedItemsCount === 0) presetLabel = ' · Keine Teile gewählt';

    $('ducats-selected-sub').textContent = `${nf(selectedItemsCount)} Teile gewählt ${totalInv ? `(von ${nf(totalInv)})` : ''}${presetLabel}`;
  }

  // KPI 2: Platin-Wert
  if ($('ducats-selected-plat')) $('ducats-selected-plat').textContent = `~${nf(selectedPlatMin)}`;
  if ($('ducats-selected-plat-sub')) {
    $('ducats-selected-plat-sub').textContent = `Min. ${nf(selectedPlatMin)}p · Median ${nf(selectedPlatMed)}p`;
  }

  // KPI 3: Gesamt-Inventar
  const invSum = ducatsData.inventory?.summary || { totalDucats: 0, totalItems: 0, duplicateDucats: 0, duplicateItems: 0 };
  if ($('ducats-inv-total-ducats')) $('ducats-inv-total-ducats').textContent = nf(invSum.totalDucats);
  if ($('ducats-inv-total-sub')) {
    $('ducats-inv-total-sub').textContent = `${nf(invSum.totalItems)} Teile im Besitz · Duplikate: ${nf(invSum.duplicateDucats)} Duk.`;
  }

  // KPI 4: Baro Kaufkraft
  const baroItems = Math.floor(selectedDucats / 375);
  if ($('ducats-baro-power')) $('ducats-baro-power').textContent = `~${baroItems}`;
  if ($('ducats-baro-sub')) {
    $('ducats-baro-sub').textContent = baroItems >= 1
      ? `Reicht für ca. ${baroItems} Primed Mods`
      : `Reicht noch für keinen Primed Mod`;
  }
  if ($('ic-baro-kaufkraft') && !$('ic-baro-kaufkraft').hasChildNodes()) {
    $('ic-baro-kaufkraft').innerHTML = Icon.baro(36);
  }

  // Tab Badge
  if ($('ducats-inv-badge-count')) {
    $('ducats-inv-badge-count').textContent = (ducatsData.inventory?.items || []).length;
  }
}

function updateDucatsModeTabs() {
  $('tab-ducats-mode-inv')?.classList.toggle('active', ducatsMode === 'inventory');
  $('tab-ducats-mode-cat')?.classList.toggle('active', ducatsMode === 'catalog');
  $('tab-ducats-mode-sets')?.classList.toggle('active', ducatsMode === 'sets');
  $('tab-ducats-mode-plan')?.classList.toggle('active', ducatsMode === 'plan');

  if ($('ducats-sets-badge-count')) {
    $('ducats-sets-badge-count').textContent = (ducatsData?.sets || []).length;
  }
  if ($('ducats-plan-badge-count')) {
    $('ducats-plan-badge-count').textContent = (ducatsData?.relicPlan || []).length;
  }

  /* Seltenheits-Chips und Sortierung beziehen sich auf einzelne Teile. In der
     Set-Ansicht haetten sie nichts zu filtern und stuenden nur im Weg - die
     Suche bleibt, die trifft auch Set-Namen. */
  const flat = ducatsMode === 'inventory' || ducatsMode === 'catalog';
  const isPlan = ducatsMode === 'plan';

  document.querySelector('.ducats-filter-badges')?.classList.toggle('hidden', !flat);
  /* Der erste Treffer ist die Sortierung des Planers - deshalb gezielt ueber
     die Kennung, nicht ueber die Klasse. */
  $('ducats-sort')?.closest('.ducats-sort-wrap')?.classList.toggle('hidden', !flat);
  $('plan-sort-wrap')?.classList.toggle('hidden', !isPlan);
  $('plan-tier-filter')?.classList.toggle('hidden', !isPlan);
}

/**
 * Relikt-Planer: welches der eigenen Relikte lohnt sich zu oeffnen?
 *
 * Gezeigt wird der Erwartungswert - Chance mal Wert, nicht der Mittelwert der
 * sechs Belohnungen. Die Chancen sind sehr ungleich (25,33 % gegen 2 %); ein
 * Mittelwert wuerde das seltene Teil genauso zaehlen wie ein haeufiges und
 * jedes Relikt wertvoller aussehen lassen, als es ist.
 */
/** Aera-Filter des Planers - dieselbe Optik wie im Inventar. */
function renderPlanTierFilter(all) {
  const box = $('plan-tier-filter');
  if (!box) return;

  const counts = new Map();
  for (const r of all) counts.set(r.tier, (counts.get(r.tier) || 0) + 1);

  const order = ['Lith', 'Meso', 'Neo', 'Axi', 'Requiem', 'Omnia'];
  const tiers = order.filter(t => counts.has(t));
  if (!tiers.length) { box.innerHTML = ''; return; }

  /* Der Merk-Chip steht neben den Aeren, weil er dieselbe Frage beantwortet:
     welcher Ausschnitt der Liste ist gerade gemeint. Er erscheint erst, wenn
     etwas gemerkt ist - ein Filter, der garantiert nichts uebrig laesst,
     gehoert nicht in die Leiste. */
  const trackedCount = trackedRelicIds.size;
  /* Ist das letzte gemerkte Relikt abgewaehlt, verschwindet der Chip - und mit
     ihm der Weg zurueck. Deshalb faellt der Filter hier von selbst weg. */
  if (!trackedCount) planOnlyTracked = false;

  box.innerHTML =
    `<button class="tier-chip ${planTier === 'all' ? 'active' : ''}" data-tier="all">
       Alle <span>${all.length}</span>
     </button>` +
    tiers.map(t => `
      <button class="tier-chip tier-${t.toLowerCase()} ${planTier === t ? 'active' : ''}" data-tier="${t}">
        ${t} <span>${counts.get(t)}</span>
      </button>`).join('') +
    (trackedCount ? `
      <button class="tier-chip chip-tracked ${planOnlyTracked ? 'active' : ''}" data-tracked="1"
              title="Nur die Relikte, die im Overlay stehen">
        ${Icon.star(11)} Gemerkt <span>${trackedCount}</span>
      </button>` : '');

  box.querySelectorAll('[data-tier]').forEach(btn => {
    btn.onclick = () => { planTier = btn.dataset.tier; renderDucatsRelicPlan(); };
  });
  box.querySelector('[data-tracked]')?.addEventListener('click', () => {
    planOnlyTracked = !planOnlyTracked;
    renderDucatsRelicPlan();
  });
}

/* Zustaende heissen im deutschen Spiel anders als in DEs Droptabelle - und
   der Inventar-Tab nebenan zeigt sie laengst uebersetzt. */
const RELIC_STATE_LABEL = {
  Intact: 'Intakt',
  Exceptional: 'Außergewöhnlich',
  Flawless: 'Makellos',
  Radiant: 'Strahlend'
};
const relicStateLabel = st => RELIC_STATE_LABEL[st] || st || '';

/**
 * Ein Relikt merken oder vergessen.
 *
 * Der Stern schaltet sofort um und wartet nicht auf die Platte: der Klick
 * soll sich wie ein Schalter anfuehlen, nicht wie ein Auftrag. Kommt die
 * gespeicherte Liste zurueck, ersetzt sie die Annahme - dann steht auch
 * wieder gerade, was ein fehlgeschlagenes Speichern verstellt haette.
 */
async function toggleTrackedRelic(id) {
  const [key, state] = id.split('|');
  const relic = (ducatsData?.relicPlan || []).find(r => r.key === key && r.state === state);

  if (trackedRelicIds.has(id)) trackedRelicIds.delete(id);
  else trackedRelicIds.add(id);
  renderDucatsRelicPlan();

  try {
    const list = await window.api.toggleTrackedRelic({
      key, state, tier: relic?.tier || '', name: relic?.name || ''
    });
    trackedRelicIds = new Set((list || []).map(t => t.id));
  } catch (err) {
    console.error('Merkliste nicht gespeichert:', err);
  }
  renderDucatsRelicPlan();
}

function renderDucatsRelicPlan() {
  const container = $('ducats-catalog');
  if (!container) return;

  const query = ($('ducat-search')?.value || '').trim().toLowerCase();
  const all = ducatsData?.relicPlan || [];

  renderPlanTierFilter(all);

  let plan = query
    ? all.filter(r => (r.tier + ' ' + r.name).toLowerCase().includes(query)
        || r.rewards.some(w => w.name.toLowerCase().includes(query)))
    : all;

  if (planTier !== 'all') plan = plan.filter(r => r.tier === planTier);
  if (planOnlyTracked) plan = plan.filter(r => trackedRelicIds.has(r.key + '|' + r.state));

  /* Sortiert wird auf einer Kopie: die Reihenfolge aus dem Hauptprozess bleibt
     erhalten, sonst wuerde jede Umsortierung die naechste beeinflussen. */
  plan = [...plan].sort((a, b) => {
    switch (planSort) {
      case 'ducats-desc': return b.expDucats - a.expDucats || b.expPlat - a.expPlat;
      case 'count-desc':  return b.count - a.count || b.expPlat - a.expPlat;
      case 'priced-desc': return b.pricedShare - a.pricedShare || b.expPlat - a.expPlat;
      case 'name-asc':    return (a.tier + a.name).localeCompare(b.tier + b.name, 'de', { numeric: true });
      default:            return b.expPlat - a.expPlat || b.expDucats - a.expDucats;
    }
  });

  if (!plan.length) {
    container.innerHTML = `
      <div class="ducats-empty-box">
        <div class="empty-icon">${Icon.relic(30)}</div>
        <h3>${all.length ? 'Keine Treffer' : 'Keine Relikte im Bestand'}</h3>
        <p>${!all.length
          ? 'Sobald Relikte im Inventar liegen, rechnet Argus hier aus, welches sich zu öffnen lohnt.'
          : planOnlyTracked
            ? 'Kein gemerktes Relikt passt zu Suche und Ära-Filter.'
            : 'Zu deiner Suche gibt es kein passendes Relikt.'}</p>
      </div>`;
    return;
  }

  container.innerHTML = plan.slice(0, 60).map(r => {
    const thin = r.pricedShare < 0.9;
    const id = r.key + '|' + r.state;
    const tracked = trackedRelicIds.has(id);

    const rewards = [...r.rewards]
      .sort((a, b) => (b.plat ?? -1) - (a.plat ?? -1) || b.chance - a.chance)
      .map(w => `
        <div class="plan-rw rarity-${esc(String(w.rarity || '').toLowerCase())}">
          <img class="plan-rw-img" src="${esc(w.image || '')}" alt="" loading="lazy"
               onerror="this.style.visibility='hidden'">
          <span class="plan-rw-name">${esc(w.name)}</span>
          <span class="plan-rw-chance">${w.chance}%</span>
          <span class="plan-rw-plat">${w.plat != null ? w.plat + 'p' : '–'}</span>
          <span class="plan-rw-duc">${w.ducats != null ? w.ducats : '–'}</span>
        </div>`).join('');

    return `
      <div class="plan-card tier-${esc(r.tier.toLowerCase())} ${tracked ? 'tracked' : ''}">
        <div class="plan-head">
          <img class="plan-img" src="${esc(r.image || '')}" alt="" loading="lazy"
               onerror="this.style.visibility='hidden'">
          <div class="plan-title">
            <span class="plan-tier">${esc(r.tier)}</span>
            <b>${esc(r.name)}</b>
            <span class="plan-state">${esc(relicStateLabel(r.state))}${r.count > 1 ? ' · ×' + r.count : ''}</span>
          </div>
          <div class="plan-exp">
            <span class="plan-exp-val" title="Erwarteter Platin-Erlös je Öffnung">
              <img class="currency-ic" src="assets/icons/currency/platinum.png" alt="Platin">
              <b>${r.expPlat}</b>
            </span>
            <span class="plan-exp-val" title="Erwarteter Dukaten-Wert je Öffnung">
              <img class="currency-ic ducat-ic" src="assets/icons/ducats.png" alt="Dukaten">
              <b>${nf(r.expDucats)}</b>
            </span>
          </div>
          <button class="plan-track ${tracked ? 'on' : ''}" data-track="${esc(id)}"
                  title="${tracked ? 'Aus dem Overlay nehmen' : 'Im Overlay anzeigen'}">
            ${Icon.star(14)}
          </button>
        </div>

        ${thin ? `<div class="plan-thin" title="Für Teile ohne bekannten Preis wird nichts angenommen">
            ${Icon.warning(12)} Preise für ${Math.round(r.pricedShare * 100)} % der Chance bekannt — Platinwert ist eine Untergrenze
          </div>` : ''}

        <div class="plan-rewards">${rewards}</div>
      </div>`;
  }).join('') + (plan.length > 60
    ? `<div class="inv-more">… und ${nf(plan.length - 60)} weitere. Nutze die Suche.</div>`
    : '');

  container.querySelectorAll('[data-track]').forEach(btn => {
    btn.onclick = () => toggleTrackedRelic(btn.dataset.track);
  });
}

/**
 * Prime-Sets mit Besitzstand.
 *
 * Dieselbe Frage wie auf den Relikt-Karten im Spiel, nur in Ruhe: von welchem
 * Set habe ich schon was, und welches Teil fehlt noch. Eine flache Teileliste
 * beantwortet das nicht - dort steht "Lex Prime Barrel x1", ohne zu verraten,
 * ob das das letzte fehlende Teil war oder das dritte Duplikat.
 */
function updateDucatsPriceButtonState(loading) {
  const btn = $('btn-ducats-fetch-prices');
  if (!btn) return;
  if (loading) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-sm"></span> Preise laden …`;
  } else {
    btn.disabled = false;
    btn.innerHTML = Icon.refresh(15) + ' <span>Preise laden</span>';
  }
}

function renderDucatsCatalog() {
  if (!ducatsData) return;
  if (ducatsMode === 'plan') return renderDucatsRelicPlan();
  if (ducatsMode === 'sets') ducatsMode = 'inventory';

  const q = ($('ducat-search')?.value || '').toLowerCase().trim();
  const rawList = ducatsMode === 'inventory'
    ? (ducatsData.inventory?.items || [])
    : (ducatsData.catalog || []);

  // Filtern
  let list = rawList.filter(it => {
    // Textsuche
    if (q) {
      const matchName = it.name.toLowerCase().includes(q);
      const matchParent = it.parentItem && it.parentItem.toLowerCase().includes(q);
      if (!matchName && !matchParent) return false;
    }

    // Filter-Chips
    if (ducatsFilter === 'advice-junk') return it.tradeAdvice?.advice === 'ducats';
    if (ducatsFilter === 'advice-plat') return it.tradeAdvice?.advice === 'plat';
    if (ducatsFilter === '100') return it.ducats >= 100;
    if (ducatsFilter === '45') return it.ducats >= 45 && it.ducats < 100;
    if (ducatsFilter === '15') return it.ducats <= 25;

    return true;
  });

  // Sortieren
  list.sort((a, b) => {
    if (ducatsSort === 'ducats-desc') {
      return b.ducats - a.ducats || (b.count || 0) - (a.count || 0) || a.name.localeCompare(b.name, 'de');
    }
    if (ducatsSort === 'plat-desc') {
      const pA = a.price?.min || 0;
      const pB = b.price?.min || 0;
      return pB - pA || b.ducats - a.ducats;
    }
    if (ducatsSort === 'ratio-desc') {
      const rA = a.tradeAdvice?.ratio || 0;
      const rB = b.tradeAdvice?.ratio || 0;
      return rB - rA || b.ducats - a.ducats;
    }
    if (ducatsSort === 'count-desc') {
      return (b.count || 0) - (a.count || 0) || b.ducats - a.ducats;
    }
    if (ducatsSort === 'name-asc') {
      return a.name.localeCompare(b.name, 'de');
    }
    return 0;
  });

  const container = $('ducats-catalog');
  if (!container) return;

  if (list.length === 0) {
    if (ducatsMode === 'inventory' && !ducatsData.inventory?.items?.length) {
      container.innerHTML = `
        <div class="ducats-empty-box">
          <div class="empty-icon">${Icon.crate(30)}</div>
          <h3>Keine Prime-Teile im Inventar</h3>
          <p>Es wurden noch keine Prime-Teile in deinem Inventar gefunden. Schalte auf den <b>Gesamtkatalog</b> um oder öffne Warframe und führe einen Inventar-Abruf durch.</p>
          <button class="btn btn-sm btn-action" id="btn-ducats-switch-to-cat">Zum Gesamtkatalog wechseln</button>
        </div>
      `;
      $('btn-ducats-switch-to-cat')?.addEventListener('click', () => {
        ducatsMode = 'catalog';
        updateDucatsModeTabs();
        renderDucatsCatalog();
      });
      return;
    }

    container.innerHTML = `
      <div class="ducats-empty-box">
        <div class="empty-icon">${Icon.search(30)}</div>
        <h3>Keine Treffer</h3>
        <p>Zu deinen Filter- und Suchkriterien wurden keine Prime-Teile gefunden.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = list.slice(0, 150).map(it => {
    const qty = sellQuantities.get(it.slug) || 0;
    const isSelected = qty > 0;
    const rarityClass = it.rarity ? `rarity-${it.rarity.toLowerCase()}` : 'rarity-common';

    // Platin-Anzeige
    let priceHtml = '';
    if (it.price && typeof it.price.min === 'number') {
      priceHtml = `
        <div class="ducat-plat-tag" title="Günstigster Preis (ingame: ${it.price.online ? 'ja' : 'nein'})">
          <img class="currency-ic" src="assets/icons/currency/platinum.png" alt="Platin">
          <b>${it.price.min}p</b>
          <span class="plat-med">Med. ${it.price.median || it.price.min}p</span>
        </div>
      `;
    } else if (isFetchingDucatPrices) {
      priceHtml = `<div class="ducat-plat-tag plat-loading">lädt …</div>`;
    } else {
      priceHtml = `<div class="ducat-plat-tag plat-none" title="Kein Angebot auf warframe.market">-</div>`;
    }

    // Trade-Advice Badge
    let adviceHtml = '';
    if (it.tradeAdvice && it.tradeAdvice.advice !== 'unknown') {
      const adv = it.tradeAdvice;
      if (adv.advice === 'ducats') {
        adviceHtml = `<span class="trade-chip chip-junk" title="${esc(adv.reason)}"><span class="chip-dot"></span>Junk (${adv.ratio} Duk/p)</span>`;
      } else if (adv.advice === 'plat') {
        adviceHtml = `<span class="trade-chip chip-plat" title="${esc(adv.reason)}"><span class="chip-dot"></span>Markt (${adv.ratio} Duk/p)</span>`;
      } else {
        adviceHtml = `<span class="trade-chip chip-neutral" title="${esc(adv.reason)}"><span class="chip-dot"></span>Fair (${adv.ratio} Duk/p)</span>`;
      }
    }

    // Inventar-Besitz-Badge
    const ownedHtml = it.count != null ? `
      <span class="ducat-owned-badge ${it.count > 1 ? 'has-dups' : ''}">
        Besitz: <b>${it.count}x</b> ${it.count > 1 ? `<small>(${it.count - 1} Dup.)</small>` : ''}
      </span>
    ` : '';

    return `
      <div class="ducat-card ${isSelected ? 'selected' : ''} ${rarityClass}">
        <div class="ducat-card-left">
          <img class="mat-icon" src="${esc(it.image || 'assets/icons/relic.png')}" alt="" onerror="this.src='assets/icons/relic.png'">
        </div>

        <div class="ducat-card-body">
          <div class="ducat-card-title-row">
            <b class="ducat-item-name" title="${esc(it.name)}">${esc(it.name)}</b>
          </div>
          <div class="ducat-card-sub">
            <span>${esc(it.parentItem || 'Prime')}</span>
            ${ownedHtml}
          </div>
          <div class="ducat-card-badges">
            <span class="ducat-badge ducat-val-badge">
              <img class="currency-ic ducat-ic" src="assets/icons/ducats.png" alt="Dukaten">
              <b>${it.ducats}</b> <small>Duk.</small>
            </span>
            ${priceHtml}
            ${adviceHtml}
          </div>
        </div>

        <div class="ducat-card-right">
          <div class="ducat-card-counter">
            <button class="ducat-btn-cnt" data-dec="${esc(it.slug)}" title="Menge verringern">-</button>
            <span class="ducat-cnt-num ${qty > 0 ? 'active' : ''}">${qty}${it.count != null ? `<small>/${it.count}</small>` : ''}</span>
            <button class="ducat-btn-cnt" data-inc="${esc(it.slug)}" title="Menge erhöhen">+</button>
          </div>
          ${it.count != null && it.count > 0 ? `
            <button class="btn-max-cnt ${qty === it.count ? 'is-max' : ''}" data-max="${esc(it.slug)}" title="Auf maximale Inventarmenge setzen">
              MAX
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');

  // Event-Handler für Zähler
  container.querySelectorAll('[data-inc]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const slug = btn.dataset.inc;
      const it = rawList.find(x => x.slug === slug);
      const cur = sellQuantities.get(slug) || 0;
      const max = it?.count != null ? it.count : 999;
      if (cur < max) {
        sellQuantities.set(slug, cur + 1);
        currentSelectionPreset = 'custom';
        updateSelectionPresetButtons();
        renderDucatsKPIs();
        renderDucatsCatalog();
      }
    };
  });

  container.querySelectorAll('[data-dec]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const slug = btn.dataset.dec;
      const cur = sellQuantities.get(slug) || 0;
      if (cur > 1) sellQuantities.set(slug, cur - 1);
      else sellQuantities.delete(slug);
      currentSelectionPreset = 'custom';
      updateSelectionPresetButtons();
      renderDucatsKPIs();
      renderDucatsCatalog();
    };
  });

  container.querySelectorAll('[data-max]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const slug = btn.dataset.max;
      const it = rawList.find(x => x.slug === slug);
      if (it && it.count > 0) {
        const cur = sellQuantities.get(slug) || 0;
        if (cur === it.count) sellQuantities.delete(slug);
        else sellQuantities.set(slug, it.count);
        currentSelectionPreset = 'custom';
        updateSelectionPresetButtons();
        renderDucatsKPIs();
        renderDucatsCatalog();
      }
    };
  });
}

let ducatsEventsInitialized = false;
function initDucatsEventListeners() {
  if (ducatsEventsInitialized) return;
  ducatsEventsInitialized = true;

  // Suche
  $('ducat-search')?.addEventListener('input', () => renderDucatsCatalog());

  // Modus-Umschalter
  $('tab-ducats-mode-inv')?.addEventListener('click', () => {
    ducatsMode = 'inventory';
    updateDucatsModeTabs();
    renderDucatsCatalog();
  });
  $('tab-ducats-mode-cat')?.addEventListener('click', () => {
    ducatsMode = 'catalog';
    updateDucatsModeTabs();
    renderDucatsCatalog();
  });
  $('tab-ducats-mode-sets')?.addEventListener('click', () => {
    ducatsMode = 'sets';
    updateDucatsModeTabs();
    renderDucatsCatalog();
  });
  $('tab-ducats-mode-plan')?.addEventListener('click', () => {
    ducatsMode = 'plan';
    updateDucatsModeTabs();
    renderDucatsCatalog();
  });

  $('plan-sort')?.addEventListener('change', e => {
    planSort = e.target.value;
    renderDucatsRelicPlan();
  });

  // Schnell-Aktionen
  $('btn-ducats-select-all')?.addEventListener('click', () => {
    if (!ducatsData?.inventory?.items) return;
    currentSelectionPreset = 'all';
    updateSelectionPresetButtons();
    for (const it of ducatsData.inventory.items) {
      if (it.count > 0) sellQuantities.set(it.slug, it.count);
    }
    renderDucatsKPIs();
    renderDucatsCatalog();
  });

  $('btn-ducats-select-dups')?.addEventListener('click', () => {
    if (!ducatsData?.inventory?.items) return;
    currentSelectionPreset = 'duplicates';
    updateSelectionPresetButtons();
    sellQuantities.clear();
    for (const it of ducatsData.inventory.items) {
      const dups = Math.max(0, it.count - 1);
      if (dups > 0) sellQuantities.set(it.slug, dups);
    }
    renderDucatsKPIs();
    renderDucatsCatalog();
  });

  $('btn-ducats-clear')?.addEventListener('click', () => {
    currentSelectionPreset = 'none';
    updateSelectionPresetButtons();
    sellQuantities.clear();
    renderDucatsKPIs();
    renderDucatsCatalog();
  });

  $('btn-ducats-fetch-prices')?.addEventListener('click', () => {
    fetchMissingDucatPrices(true);
  });

  // Filter-Chips
  document.querySelectorAll('.ducats-filter-badges .filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.ducats-filter-badges .filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      ducatsFilter = chip.dataset.filter || 'all';
      renderDucatsCatalog();
    });
  });

  // Sortierung
  $('ducats-sort')?.addEventListener('change', (e) => {
    ducatsSort = e.target.value;
    renderDucatsCatalog();
  });
}

/* ---------------- Inventar ---------------- */

let inventoryData = null;
let invSection = 'relics';
let invTier = 'all';        // Aera-Filter, nur im Relikt-Bereich

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

  /* Herkunft und Alter stehen bereits neben dem Aktualisieren-Knopf - ein
     eigener Balken darueber sagte dasselbe ein zweites Mal und kostete bei
     jedem Blick eine Zeile.

     Was NICHT verloren gehen darf, ist die Drosselung: dass ein Abruf gerade
     nicht moeglich ist, gehoert an den Knopf, den man sonst vergeblich
     drueckt. */
  const q = QUELLEN[d.source] || QUELLEN.api;
  const refreshBtn = $('btn-inv-refresh');
  if (refreshBtn) {
    refreshBtn.classList.toggle('is-gated', !d.gate.allowed);
    refreshBtn.title = d.gate.allowed
      ? `${q.label} · Stand ${relativeAge(d.fetchedAt)}`
      : `Nächster Abruf in ${d.gate.waitText}`;
  }

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
    ['Endo', d.currencies.endo, 'endo'],
    ['Dukaten', d.currencies.ducats, 'ducats']
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
    btn.onclick = () => { invSection = btn.dataset.inv; invTier = 'all'; renderInventory(); };
  });

  renderInventoryGrid();
}

/**
 * Aera-Filter fuer Relikte.
 *
 * Nur die Aeren anzeigen, die im Bestand auch vorkommen - eine Schaltflaeche
 * fuer Omnia, wenn man kein einziges hat, waere eine Sackgasse. Die Anzahl
 * steht dabei, weil sie die eigentliche Auskunft ist.
 */
function renderInvTierFilter(all) {
  const box = $('inv-tier-filter');
  if (!box) return;

  if (invSection !== 'relics') {
    box.classList.add('hidden');
    return;
  }

  const counts = new Map();
  for (const e of all) {
    if (!e.tier) continue;
    counts.set(e.tier, (counts.get(e.tier) || 0) + (e.count || 0));
  }

  const order = ['Lith', 'Meso', 'Neo', 'Axi', 'Requiem', 'Omnia'];
  const tiers = order.filter(t => counts.has(t));
  if (!tiers.length) { box.classList.add('hidden'); return; }

  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  box.classList.remove('hidden');
  box.innerHTML =
    `<button class="tier-chip ${invTier === 'all' ? 'active' : ''}" data-tier="all">
       Alle <span>${nf(total)}</span>
     </button>` +
    tiers.map(t => `
      <button class="tier-chip tier-${t.toLowerCase()} ${invTier === t ? 'active' : ''}" data-tier="${t}">
        ${t} <span>${nf(counts.get(t))}</span>
      </button>`).join('');

  box.querySelectorAll('[data-tier]').forEach(btn => {
    btn.onclick = () => {
      invTier = btn.dataset.tier;
      renderInventoryGrid();
    };
  });
}

function renderInventorySets(sets) {
  const container = $('inv-grid');
  if (!container) return;

  if (!sets.length) {
    container.innerHTML = `<div class="empty" style="grid-column: 1 / -1;">Keine passenden Prime-Sets gefunden.</div>`;
    return;
  }

  container.innerHTML = sets.map(s => {
    const pct = s.totalParts ? Math.min(100, Math.round((s.ownedParts / s.totalParts) * 100)) : 0;

    const parts = s.parts.map(p => {
      const req = p.required || 1;
      const hasEnough = p.count >= req;
      const isPartial = !hasEnough && p.count > 0;
      const countLabel = req > 1
        ? `${p.count}/${req}`
        : (p.count > 0 ? '×' + p.count : '–');

      return `
      <div class="set-part ${hasEnough ? 'has' : (isPartial ? 'partial' : 'missing')}" title="${esc(p.name)} · ${req > 1 ? req + 'x benötigt · ' : ''}${p.ducats} Dukaten${p.price ? ' · ' + p.price.min + 'p' : ''}">
        <img class="set-part-img" src="${esc(p.image || '')}" alt=""
             onerror="this.style.visibility='hidden'">
        <span class="set-part-name">${esc(p.shortName)}</span>
        <span class="set-part-count">${countLabel}</span>
      </div>`;
    }).join('');

    return `
      <div class="set-card ${s.complete ? 'complete' : ''}">
        <div class="set-card-body">
          ${s.image ? `
            <div class="set-art-showcase">
              <img class="set-art-img" src="${esc(s.image)}" alt="" loading="lazy" onerror="this.parentElement.style.display='none'">
            </div>` : ''}
          <div class="set-main-content">
            <div class="set-head">
              <div class="set-title">
                <b>${esc(s.name)}</b>
                <span>${s.ownedParts} / ${s.totalParts} Teile${s.complete ? ' · komplett' : ''}</span>
              </div>
              <div class="set-progress" title="${pct} % beisammen">
                <div class="set-progress-fill" style="width: ${pct}%"></div>
              </div>
            </div>
            <div class="set-parts">${parts}</div>
          </div>
        </div>

        <div class="set-foot">
          <span class="set-val" title="Dukaten für alle deine Teile dieses Sets, Duplikate mitgezählt">
            <img class="currency-ic ducat-ic" src="assets/icons/ducats.png" alt="Dukaten">
            <b>${nf(s.ownedDucats)}</b> <small>Dukaten</small>
          </span>
          <span class="set-val">
            <img class="currency-ic" src="assets/icons/currency/platinum.png" alt="Platin">
            <b>${s.setPrice ? s.setPrice.min : '–'}</b> <small>Set</small>
          </span>
        </div>
      </div>`;
  }).join('');
}

let currentInvList = [];
let invRenderedCount = 0;
let invChunkObserver = null;
const INV_CHUNK_SIZE = 60;

function setupInvGridEvents(grid) {
  if (!grid || grid.dataset.delegated) return;
  grid.dataset.delegated = 'true';

  grid.onclick = (e) => {
    const el = e.target.closest('[data-idx]');
    if (!el) return;
    const idx = Number(el.dataset.idx);
    const item = currentInvList?.[idx];
    if (item) {
      const open = invSection === 'relics' ? openRelicModal : openUpgradeModal;
      open(item);
    }
  };

  grid.addEventListener('error', (e) => {
    const img = e.target;
    if (!img || img.tagName !== 'IMG') return;
    if (img.matches('.mod-art img, .arc-art img')) {
      img.style.visibility = 'hidden';
    } else if (img.matches('.mat-icon')) {
      img.classList.add('is-missing');
    }
  }, true);
}

function loadNextInvChunk() {
  const grid = $('inv-grid');
  const sentinel = $('inv-sentinel');
  if (!grid || !currentInvList || invRenderedCount >= currentInvList.length) {
    if (invChunkObserver) {
      invChunkObserver.disconnect();
      invChunkObserver = null;
    }
    sentinel?.remove();
    return;
  }

  const nextBatch = currentInvList.slice(invRenderedCount, invRenderedCount + INV_CHUNK_SIZE);
  const tileFn = invSection === 'mods' ? modTile : (invSection === 'arcanes' ? arcaneTile : plainRow);
  const html = nextBatch.map((item, idx) => tileFn(item, invRenderedCount + idx)).join('');
  invRenderedCount += nextBatch.length;

  if (sentinel) {
    sentinel.insertAdjacentHTML('beforebegin', html);
    if (invRenderedCount >= currentInvList.length) {
      if (invChunkObserver) {
        invChunkObserver.disconnect();
        invChunkObserver = null;
      }
      sentinel.remove();
    }
  } else {
    grid.insertAdjacentHTML('beforeend', html);
  }
}

function renderInventoryGrid() {
  const d = inventoryData;
  if (!d || !d.sections) return;
  const query = ($('inv-search')?.value || '').toLowerCase().trim();
  const all = d.sections[invSection] || [];

  if (invChunkObserver) {
    invChunkObserver.disconnect();
    invChunkObserver = null;
  }

  /* Betriebsart des Rasters. MUSS hier oben stehen, vor allen vorzeitigen
     Ausstiegen: die Sets-Ansicht und der Leerfall steigen weiter unten aus,
     und blieben dann mit der Spaltenbreite der vorigen Ansicht zurueck -
     Set-Karten brauchen 320 px, Mod-Karten 184, und die zuletzt im
     Stilblatt stehende Regel gewinnt. */
  const grid = $('inv-grid');
  grid?.classList.toggle('is-sets', invSection === 'sets');
  grid?.classList.toggle('is-cards', invSection === 'mods');
  grid?.classList.toggle('is-arcanes', invSection === 'arcanes');

  if (grid) setupInvGridEvents(grid);

  renderInvTierFilter(all);

  let list = all;
  if (invSection === 'sets') {
    list = query
      ? all.filter(s => s.name.toLowerCase().includes(query) || s.parts.some(p => p.name.toLowerCase().includes(query)))
      : all;
  } else {
    list = query ? all.filter(e => e.name.toLowerCase().includes(query)) : all;
    if (invSection === 'relics' && invTier !== 'all') {
      list = list.filter(e => e.tier === invTier);
    }
  }

  const total = d.totals[invSection] || { arten: all.length, stueck: 0 };
  const alt = (QUELLEN[d.source] || QUELLEN.api).stale && d.fetchedAt
    ? ` · Stand ${new Date(d.fetchedAt).toLocaleDateString('de-DE')}`
    : '';
  $('inv-meta').innerHTML = (query
    ? `${nf(list.length)} von ${nf(all.length)} Einträgen`
    : invSection === 'sets'
      ? `${nf(total.arten)} Sets · ${nf(total.complete || 0)} vollständig`
      : `${nf(total.arten)} Arten · ${nf(total.stueck)} Stück insgesamt`) + esc(alt);

  if (invSection === 'sets') {
    currentInvList = list;
    renderInventorySets(list);
    return;
  }

  if (!list.length) {
    currentInvList = [];
    $('inv-grid').innerHTML = `<div class="empty">Nichts gefunden für „${esc(query)}“.</div>`;
    return;
  }

  /* Progressives Rendern in Chunks: die ersten 60 Karten erscheinen sofort (<5ms),
     weitere werden beim Scrollen über einen IntersectionObserver nachgeladen. */
  currentInvList = list;
  const initial = list.slice(0, INV_CHUNK_SIZE);
  invRenderedCount = initial.length;

  const tileFn = invSection === 'mods' ? modTile : (invSection === 'arcanes' ? arcaneTile : plainRow);
  const initialHtml = initial.map((item, idx) => tileFn(item, idx)).join('');

  if (list.length > initial.length) {
    grid.innerHTML = initialHtml + '<div id="inv-sentinel" class="inv-sentinel"></div>';
    const sentinel = $('inv-sentinel');
    if (sentinel) {
      invChunkObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            loadNextInvChunk();
          }
        }
      }, {
        rootMargin: '600px 0px'
      });
      invChunkObserver.observe(sentinel);
    }
  } else {
    grid.innerHTML = initialHtml;
  }
}

/* ---------------- Kacheln des Inventar-Rasters ---------------- */

/**
 * Ausgefallene Bilder abfangen.
 *
 * ACHTUNG: onerror="..." als Attribut laeuft hier NICHT. Die
 * Content-Security-Policy der Seite laesst nur Skripte aus eigenen Dateien zu,
 * und ein Attribut-Handler zaehlt als Inline-Skript - er wird stillschweigend
 * verworfen. Statt eines fehlenden Bildes bliebe dann der Alternativtext
 * mitten im Raster stehen.
 *
 * Der zweite Teil ist genauso wichtig: ein Bild, das schon vor dem Verdrahten
 * aufgegeben hat, feuert kein Ereignis mehr. `complete` bei Breite 0 heisst
 * genau das - fertig geladen und trotzdem nichts da.
 */
function onImageFail(root, selector, fix) {
  root.querySelectorAll(selector).forEach(img => {
    if (img.complete && img.naturalWidth === 0) fix(img);
    else img.addEventListener('error', () => fix(img), { once: true });
  });
}

/**
 * Mod-Karte mit DEN ZWEI ZUSTAENDEN, die sie im Spiel auch hat.
 *
 * ZUGEKLAPPT steht nur der Name da. AUFGEKLAPPT faehrt die Karte auf und zeigt
 * Illustration, Wirkung und Kompatibilitaet.
 *
 * WARUM SELBST GEZEICHNET UND NICHT ALS FERTIGES BILD:
 *   Ein gerendertes Kartenbild kennt nur EINEN Zustand. Den zugeklappten
 *   daraus zu schneiden geht nicht - er hat einen anderen Aufbau, und wo der
 *   Name sitzt, haengt an der Laenge des Wirkungstextes. Hier steht jedes Teil
 *   an seinem Platz, und der Wechsel ist eine Frage von Hoehe und Deckkraft.
 *
 * Der Aufbau folgt dem, was Overframe macht: Rahmenteile als Hintergrundbilder
 * (die echten Spiel-Texturen), die Illustration darin, Text darueber. Der
 * zugeklappte Zustand entsteht dadurch, dass die Karte nur 90 px hoch ist und
 * `overflow: hidden` alles darunter abschneidet - waehrend der Name mit einem
 * negativen `top` nach oben ueber die abgedunkelte Illustration rutscht.
 */
function modTile(e, i) {
  const rank = e.maxRank ?? 0;
  const rarity = String(e.rarity || 'common').toLowerCase();

  return `
    <div class="mod-slot" ${e.resolved ? `data-idx="${i}" title="Datenblatt öffnen"` : ''}>
      <div class="mod-card rar-${esc(rarity)}">
        <div class="mod-edge"></div>
        <div class="mod-inner">
          ${e.drain != null ? `
            <div class="mod-drain ${e.isAura ? 'is-aura' : ''}">
              ${e.isAura ? '+' : ''}${e.drain}
              ${e.polarity ? `<span class="mod-pol">${Icon.polarity(e.polarity.glyph, 11)}</span>` : ''}
            </div>` : ''}
          <figure class="mod-art">
            <img src="${esc(e.art || e.image)}" alt="" loading="lazy">
          </figure>
          <div class="mod-text">
            <p class="mod-name">${esc(e.name)}</p>
            ${(e.stats || []).map(s => `<p class="mod-stat">${esc(s)}</p>`).join('')}
          </div>
          ${e.compat ? `<div class="mod-compat"><p>${esc(e.compat)}</p></div>` : ''}
          ${e.pips ? `
            <div class="mod-pips ${rank >= e.pips ? 'is-max' : ''}">
              ${Array.from({ length: e.pips }, (_, p) =>
                `<i class="${p < rank ? 'on' : ''}">★</i>`).join('')}
            </div>` : ''}
        </div>
      </div>
      <span class="mod-count">${nf(e.count)}</span>
    </div>`;
}

/**
 * Arcanes sind keine Karten, sondern Gefaesse - quer statt hochkant und ohne
 * Rahmen, in dem ein Name stuende. Der steht deshalb darunter.
 */
function arcaneTile(e, i) {
  return `
    <div class="arc-tile" ${e.resolved ? `data-idx="${i}" title="Datenblatt öffnen"` : ''}>
      <div class="arc-art">
        <img src="${esc(e.card || e.image)}" alt="" loading="lazy">
        <span class="mod-count">${nf(e.count)}</span>
      </div>
      <b>${esc(e.name)}</b>
      ${e.ranks?.length ? `<span class="inv-tag">${e.ranks.map(r =>
        `Rang ${r.rank}${r.count > 1 ? '×' + r.count : ''}`).join(', ')}</span>` : ''}
    </div>`;
}

/** Relikte, Materialien, Blueprints: die gewohnte Zeile. */
function plainRow(e, i) {
  const extra = e.quality ? `<span class="inv-tag">${esc(e.quality)}</span>` : '';
  const clickable = invSection === 'relics';
  return `
    <div class="inv-item ${clickable ? 'is-clickable' : ''}"
         ${clickable ? `data-idx="${i}" title="Datenblatt öffnen"` : `title="${esc(e.uniqueName)}"`}>
      <img class="mat-icon" src="${esc(e.image)}" alt="" loading="lazy">
      <div class="inv-item-body">
        <b>${esc(e.name)}</b>
        ${extra}
      </div>
      <span class="inv-item-count">${nf(e.count)}</span>
    </div>`;
}

/* ---------------- Datenblatt einer Mod / eines Arcanes ---------------- */

let upgradeData = null;
let upgradeRank = 0;

/**
 * Oeffnet das Datenblatt zu einer Karte aus dem Inventar.
 *
 * Der Inventar-Eintrag wandert mit in den Hauptprozess: Anzahl und Raenge
 * liegen hier bereits vor, und die Inventardatei ist ein Megabyte gross -
 * sie je Klick neu zu lesen waere Verschwendung.
 */
async function openUpgradeModal(entry) {
  if (!entry?.uniqueName) return;
  const modal = $('upgrade-modal');
  const content = $('upgrade-modal-content');
  if (!modal || !content) return;

  modal.classList.remove('hidden');
  content.innerHTML = `<div class="up-loading">${Icon.refresh(22)}<span>Lade Datenblatt …</span></div>`;

  const res = await window.api.getUpgradeDetails(entry.uniqueName, {
    count: entry.count || 0,
    ranks: entry.ranks || [],
    maxRank: entry.maxRank ?? null
  });

  if (!res.ok) {
    content.innerHTML = `
      <div class="im-header">
        <div class="im-title-group"><h2>${esc(entry.name)}</h2></div>
        <button class="modal-close-icon" id="up-close" title="Schließen">&times;</button>
      </div>
      <div class="im-scroll-body">
        <p class="up-empty">${esc(res.error || 'Datenblatt konnte nicht geladen werden.')}</p>
      </div>`;
    $('up-close').onclick = closeUpgradeModal;
    return;
  }

  upgradeData = res.data;
  /* Startwert ist der hoechste Rang, den man BESITZT - er zeigt, was die Karte
     gerade wirklich tut. Ohne Besitz der Maximalrang, denn danach fragt, wer
     die Karte noch sucht. */
  upgradeRank = upgradeData.owned?.maxRank ?? upgradeData.maxRank;
  renderUpgradeModal();
}

function closeUpgradeModal() {
  $('upgrade-modal')?.classList.add('hidden');
}

/**
 * Adresse im offiziellen Warframe-Wiki. Dieselbe Quelle, aus der auch die
 * Kartenbilder kommen - der alte Fandom-Spiegel wird nicht mehr gepflegt.
 */
const wikiLink = name =>
  'https://wiki.warframe.com/w/' + encodeURIComponent(String(name).replace(/ /g, '_'));

/** Herkunft der Fundorte - wer die Zahlen liest, soll wissen, woher sie kommen. */
const UPGRADE_ORIGIN = {
  de:           'Fundorte aus den offiziellen Droptabellen von Digital Extremes.',
  warframestat: 'Fundorte über warframestat.us – Angebote, die DE nicht als Drop führt.',
  rule:         'Diese Karte fällt nirgends: die Einordnung stammt aus dem Pfad, in den DE sie sortiert hat.'
};

function renderUpgradeModal() {
  const d = upgradeData;
  const content = $('upgrade-modal-content');
  if (!d || !content) return;

  const row = d.ranks[upgradeRank] || d.ranks[d.ranks.length - 1] || { stats: [] };
  const owned = d.owned && d.owned.count > 0 ? d.owned : null;
  const ownedRanks = new Set((owned?.ranks || []).map(r => r.rank));

  const badges = [
    `<span class="im-badge cat">${esc(d.kindLabel)}</span>`,
    d.typeLabel ? `<span class="im-badge">${esc(d.typeLabel)}</span>` : '',
    d.rarityLabel ? `<span class="im-badge rar-${esc(String(d.rarity).toLowerCase())}">${esc(d.rarityLabel)}</span>` : '',
    /* Bei einer Aura sagt das schon der Typ - zweimal "Aura" nebeneinander
       ist keine zusaetzliche Auskunft. */
    d.isAura && d.typeLabel !== 'Aura' ? '<span class="im-badge">Aura</span>' : '',
    d.isExilus ? '<span class="im-badge">Exilus</span>' : ''
  ].join('');

  /* Kopfzeile: worauf die Karte passt und mit welcher Polaritaet. Beides ist
     die erste Frage beim Bauen, deshalb steht es unter dem Namen und nicht
     erst unten in den Werten. */
  const subline = [
    d.compat ? `Passt auf <b>${esc(d.compat)}</b>` : null,
    d.polarity ? `Polarität <b class="up-pol">${Icon.polarity(d.polarity.glyph, 12)}${esc(d.polarity.label)}</b>` : null
  ].filter(Boolean).join(' · ');

  /* Kosten der gewaehlten Stufe. Mods zahlen Kapazitaet und Endo, Arcanes
     bezahlen mit sich selbst - dort steht die Zahl der Exemplare. */
  const rankCost = d.kind === 'arcane'
    ? `<span>Braucht <b>${nf(row.copies)}</b> Exemplare</span>`
    : [
        `<span>${d.isAura ? 'Gibt' : 'Kostet'} <b>${nf(row.drain)}</b> Kapazität</span>`,
        row.endo ? `<span><b>${nf(row.endo)}</b> Endo bis hierher</span>` : ''
      ].join('');

  const tiles = [
    ['Max-Rang', d.maxRank],
    d.kind === 'arcane'
      ? ['Exemplare für Max', nf(d.copiesToMax)]
      : [d.isAura ? 'Kapazität bei Max' : 'Kosten bei Max', nf(d.maxDrain)],
    d.kind === 'arcane' ? null : ['Endo bis Max', nf(d.endoToMax)],
    /* Dritter Eintrag ist fertiges Markup - nur die Polaritaet braucht es,
       weil ihr Zeichen eine Vektorgrafik ist und kein Buchstabe. */
    d.polarity
      ? ['Polarität', d.polarity.label,
         `<span class="up-pol">${Icon.polarity(d.polarity.glyph, 13)}${esc(d.polarity.label)}</span>`]
      : null,
    d.rarityLabel ? ['Seltenheit', d.rarityLabel] : null,
    d.compat ? ['Kompatibel', d.compat] : null
  ].filter(Boolean);

  const wikiUrl = wikiLink(d.name);

  content.innerHTML = `
    <div class="im-header">
      <div class="im-header-left">
        <!-- Die gerenderte Karte, wenn es sie gibt: sie zeigt Rahmen, Rang-
             punkte und Polaritaet so, wie sie im Spiel aussehen. Sonst bleibt
             das Bild aus DEs Export. -->
        <div class="im-art-wrap up-art-wrap ${d.card ? 'has-card' : ''} is-${esc(d.kind)}">
          <img class="im-art" src="${esc(d.card || d.image)}" alt="">
        </div>
        <div class="im-title-group">
          <div class="im-tags">${badges}</div>
          <h2>${esc(d.name)}</h2>
          ${subline ? `<div class="up-subline">${subline}</div>` : ''}
        </div>
      </div>
      <button class="modal-close-icon" id="up-close" title="Schließen">&times;</button>
    </div>

    <div class="im-scroll-body">
      ${owned ? `
        <div class="im-section">
          <div class="im-section-title">Im Besitz</div>
          <div class="up-owned">
            <b>${nf(owned.count)}</b>
            <span>${owned.count === 1 ? 'Exemplar' : 'Exemplare'}</span>
            ${owned.ranks.length ? `<span class="up-owned-ranks">${owned.ranks.map(r =>
              `Rang ${r.rank}${r.count > 1 ? ' ×' + r.count : ''}`).join(' · ')}</span>` : ''}
            ${d.kind === 'arcane' && d.copiesToMax && owned.copies < d.copiesToMax
              ? `<span class="up-owned-ranks">noch ${nf(d.copiesToMax - owned.copies)} bis Rang ${d.maxRank}</span>`
              : ''}
          </div>
        </div>` : ''}

      <div class="im-section">
        <div class="im-section-title">Wirkung</div>
        <div class="up-ranks">
          ${d.ranks.map(r => `
            <button class="up-rank ${r.rank === upgradeRank ? 'active' : ''} ${ownedRanks.has(r.rank) ? 'has' : ''}"
                    data-rank="${r.rank}"
                    title="${ownedRanks.has(r.rank) ? 'Rang ' + r.rank + ' im Besitz' : 'Rang ' + r.rank}">
              ${r.rank}
            </button>`).join('')}
        </div>
        <div class="up-stats">
          ${row.stats.length
            /* Alle Zeilen in EINEM Kasten, so wie die Karte im Spiel aussieht.
               Einzelne Kaesten je Zeile reissen zusammengehoerige Angaben
               auseinander ("On Energy Pickup:" stuende dann allein). */
            ? `<div class="up-stat">${row.stats.map(esc).join('<br>')}</div>`
            : '<div class="up-empty">Für diesen Rang nennt der Export keine Werte.</div>'}
        </div>
        <div class="up-rank-cost">${rankCost}</div>
        ${d.description.length ? `
          <p class="im-desc up-desc">${d.description.map(esc).join('<br>')}</p>` : ''}
      </div>

      <div class="im-section">
        <div class="im-section-title">Werte</div>
        <div class="im-stats-grid">
          ${tiles.map(([label, val, html]) => `
            <div class="im-stat-tile">
              <span class="st-label">${esc(label)}</span>
              <b class="st-val">${html || esc(String(val))}</b>
            </div>`).join('')}
        </div>
      </div>

      ${d.set ? `
        <div class="im-section">
          <div class="im-section-title">Set-Bonus · ${esc(d.set.name)}</div>
          <p class="up-set-hint">Jede getragene Karte des Sets verstärkt alle anderen.</p>
          <div class="up-set">
            ${d.set.members.map(m => `
              <span class="up-set-part ${m === d.name ? 'is-self' : ''}">${esc(m)}</span>`).join('')}
          </div>
        </div>` : ''}

      <div class="im-section">
        <div class="im-section-title">Woher bekommt man das?</div>
        ${renderUpgradeSources(d)}
        <div class="up-src-foot">
          ${d.sources.origin ? `<span>${esc(UPGRADE_ORIGIN[d.sources.origin] || '')}</span>` : ''}
          <a class="up-wiki" href="${esc(wikiUrl)}" target="_blank" rel="noreferrer">
            ${Icon.link(13)}<span>Im Wiki nachschlagen</span>
          </a>
        </div>
      </div>
    </div>`;

  $('up-close').onclick = closeUpgradeModal;
  content.querySelectorAll('[data-rank]').forEach(btn => {
    btn.onclick = () => { upgradeRank = Number(btn.dataset.rank); renderUpgradeModal(); };
  });

  /* Bleibt die gezeichnete Karte aus, tritt das Bild aus DEs Export an ihre
     Stelle - und der Rahmen im Kopf schrumpft wieder auf Bildgroesse. */
  onImageFail(content, '.im-art', img => {
    img.src = d.image;
    img.closest('.im-art-wrap')?.classList.remove('has-card');
  });
}

/** Fundorte, nach Art gruppiert. Leer ist ein eigener Fall, kein leerer Kasten. */
function renderUpgradeSources(d) {
  const groups = d.sources?.groups || [];
  if (!groups.length) {
    return `<div class="up-empty">
      ${esc(d.dropNote || 'In den Droptabellen steht zu dieser Karte kein Fundort. '
        + 'Das trifft vor allem zeitlich begrenzte Belohnungen – im Handel gibt es sie trotzdem.')}
    </div>`;
  }

  return groups.map(g => `
    <div class="up-src-group">
      <div class="up-src-head">${esc(g.label)}</div>
      ${g.entries.map(e => `
        <div class="up-src-row">
          <span class="up-src-place">${esc(e.place)}</span>
          ${e.detail ? `<span class="up-src-detail">${esc(e.detail)}</span>` : ''}
          ${e.chanceText ? `<span class="up-src-chance">${esc(e.chanceText)}</span>` : ''}
        </div>`).join('')}
      ${g.hidden ? `<div class="up-src-more">… und ${nf(g.hidden)} weitere</div>` : ''}
    </div>`).join('');
}

$('upgrade-modal').onclick = e => {
  if (e.target === $('upgrade-modal')) closeUpgradeModal();
};

/* ---------------- Datenblatt eines Relikts ---------------- */

let relicData = null;
let relicState = 'Intact';

/* Seltenheit der Belohnung - dieselben drei Stufen wie im Auswahlbildschirm. */
const REWARD_RARITY = { Common: 'Gewöhnlich', Uncommon: 'Ungewöhnlich', Rare: 'Selten' };

async function openRelicModal(entry) {
  if (!entry?.uniqueName) return;
  const modal = $('relic-modal');
  const content = $('relic-modal-content');
  if (!modal || !content) return;

  modal.classList.remove('hidden');
  content.innerHTML = `<div class="up-loading">${Icon.refresh(22)}<span>Lade Belohnungstabelle …</span></div>`;

  const res = await window.api.getRelicDetails(entry.uniqueName);
  if (!res.ok) {
    content.innerHTML = `
      <div class="im-header">
        <div class="im-title-group"><h2>${esc(entry.name)}</h2></div>
        <button class="modal-close-icon" id="rl-close" title="Schließen">&times;</button>
      </div>
      <div class="im-scroll-body">
        <p class="up-empty">${esc(res.error || 'Belohnungen konnten nicht geladen werden.')}</p>
      </div>`;
    $('rl-close').onclick = closeRelicModal;
    return;
  }

  relicData = res.data;
  /* Die eigene Politur-Stufe zuerst - danach ist gefragt, wer im Inventar
     darauf geklickt hat. */
  relicState = relicData.currentState || 'Intact';
  renderRelicModal();
}

function closeRelicModal() {
  $('relic-modal')?.classList.add('hidden');
}

function renderRelicModal() {
  const d = relicData;
  const content = $('relic-modal-content');
  if (!d || !content) return;

  const cur = d.states.find(s => s.state === relicState) || d.states[0];

  /* Der Erwartungswert ist eine Untergrenze, solange nicht jede Belohnung
     einen Preis hat - das gehoert dazugesagt, sonst liest sich die Zahl
     genauer, als sie ist. */
  const unpriced = cur.pricedShare < 0.999;

  content.innerHTML = `
    <div class="im-header">
      <div class="im-header-left">
        <div class="im-art-wrap rl-art-wrap">
          <img class="im-art" src="${esc(d.image || '')}" alt="">
        </div>
        <div class="im-title-group">
          <div class="im-tags">
            <span class="im-badge cat">Relikt</span>
            ${d.tier ? `<span class="im-badge tier-${esc(d.tier.toLowerCase())}">${esc(d.tier)}</span>` : ''}
            ${d.vaulted ? '<span class="im-badge rar-rare">Vaulted</span>' : ''}
          </div>
          <h2>${esc(d.displayName)}</h2>
          <div class="up-subline">
            ${d.total ? `<b>${nf(d.total)}</b> im Bestand` : 'Nicht im Bestand'}
            ${d.vaulted ? ' · fällt zurzeit nirgends' : ''}
          </div>
        </div>
      </div>
      <button class="modal-close-icon" id="rl-close" title="Schließen">&times;</button>
    </div>

    <div class="im-scroll-body">
      <div class="im-section">
        <div class="im-section-title">Politur-Stufe</div>
        <p class="up-set-hint">
          Alle vier Stufen zeigen dieselben sechs Belohnungen – nur die Chancen verschieben sich
          zur seltenen hin.
        </p>
        <div class="rl-states">
          ${d.states.map(s => `
            <button class="rl-state ${s.state === relicState ? 'active' : ''} ${s.count ? 'has' : ''}"
                    data-state="${esc(s.state)}">
              ${esc(s.label)}<span>${nf(s.count)}</span>
            </button>`).join('')}
        </div>
      </div>

      ${cur.rewards.length ? `
        <div class="im-section">
          <div class="im-section-title">Belohnungen</div>
          <div class="rl-rewards">
            ${cur.rewards.map(r => `
              <div class="rl-reward rar-${esc(String(r.rarity || '').toLowerCase())}">
                <img class="mat-icon" src="${esc(r.image || '')}" alt="" loading="lazy">
                <div class="rl-reward-body">
                  <b>${esc(r.name)}</b>
                  <span>${esc(REWARD_RARITY[r.rarity] || r.rarity || '')}</span>
                </div>
                <span class="rl-chance">${esc(fmtChance(r.chance))}</span>
                <span class="rl-val">
                  <img class="currency-ic" src="assets/icons/currency/platinum.png" alt="Platin">
                  ${r.plat != null ? nf(r.plat) : '–'}
                </span>
                <span class="rl-val">
                  <img class="currency-ic ducat-ic" src="assets/icons/ducats.png" alt="Dukaten">
                  ${r.ducats != null ? nf(r.ducats) : '–'}
                </span>
              </div>`).join('')}
          </div>
        </div>

        <div class="im-section">
          <div class="im-section-title">Was ein Öffnen im Schnitt bringt</div>
          <div class="im-stats-grid">
            <div class="im-stat-tile">
              <span class="st-label">Platin${unpriced ? ' (mindestens)' : ''}</span>
              <b class="st-val">${nf(cur.expPlat)}</b>
            </div>
            <div class="im-stat-tile">
              <span class="st-label">Dukaten</span>
              <b class="st-val">${nf(cur.expDucats)}</b>
            </div>
          </div>
          ${unpriced ? `
            <p class="up-set-hint" style="margin-top:9px;">
              Für ${Math.round((1 - cur.pricedShare) * 100)} % der Chance liegt kein Platinpreis vor –
              der Platinwert ist deshalb eine Untergrenze, keine Schätzung.
            </p>` : ''}
        </div>
      ` : `
        <div class="im-section">
          <div class="im-section-title">Belohnungen</div>
          <div class="up-empty">
            Für dieses Relikt steht keine Belohnungstabelle bereit. Vaulted Relikte führt DE
            nicht mehr auf – die Belohnungen bleiben dieselben, nachschlagen lässt sich das
            aber nur im Wiki.
          </div>
        </div>`}

      <div class="im-section">
        <div class="im-section-title">Woher bekommt man das?</div>
        ${d.vaulted
          ? `<div class="up-empty">Dieses Relikt ist im Tresor – es fällt zurzeit nirgends.
             Es bleibt der Handel oder das Warten auf eine Unvaulting.</div>`
          : renderUpgradeSources(d)}
        <div class="up-src-foot">
          ${d.sources?.origin ? `<span>${esc(UPGRADE_ORIGIN[d.sources.origin] || '')}</span>` : ''}
          <a class="up-wiki" target="_blank" rel="noreferrer" href="${esc(wikiLink(d.key))}">
            ${Icon.link(13)}<span>Im Wiki nachschlagen</span>
          </a>
        </div>
      </div>
    </div>`;

  $('rl-close').onclick = closeRelicModal;
  content.querySelectorAll('[data-state]').forEach(btn => {
    btn.onclick = () => { relicState = btn.dataset.state; renderRelicModal(); };
  });

  /* Nicht handelbare Belohnungen haben kein Marktbild. Der Platz bleibt
     stehen, damit die Spalte daneben nicht verrutscht. */
  onImageFail(content, '.im-art, .rl-reward .mat-icon', img => { img.style.visibility = 'hidden'; });
}

/** Chancen kommen als Zahl - hier bekommen sie Komma und Prozentzeichen. */
const fmtChance = v => v == null
  ? '–'
  : `${Number(v).toLocaleString('de-DE', { maximumFractionDigits: 2 })} %`;

$('relic-modal').onclick = e => {
  if (e.target === $('relic-modal')) closeRelicModal();
};

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
    hintEl.innerHTML = `<span class="notif-hit-ic">${Icon.target(13)}</span><span><b>${matches.length} passende Risse</b> jetzt aktiv: ${topMatches}</span>`;
  } else {
    hintEl.innerHTML = '<span>Aktuell <b>keine Treffer</b> bei den gewählten Filtern</span>';
  }
}

function getModalSettingsForm() {
  /* Die drei Hauptschalter stehen jetzt im Einstellungs-Tab. Sie werden hier
     unveraendert mitgefuehrt, weil updateModalMatchesHint sie braucht: die
     Vorschau soll dasselbe Ergebnis zeigen wie der spaetere Toast, und der
     prueft zuerst enabled. */
  const enabled = notificationSettings?.enabled !== false;
  const sound = notificationSettings?.sound !== false;
  const desktopToast = notificationSettings?.desktopToast !== false;

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
      enabled: notificationSettings?.fissures?.enabled !== false,
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



/* ============================================================================
   Einstellungen

   Tastenkuerzel und die drei Hauptschalter der Benachrichtigungen. Die Auswahl,
   WELCHE Risse gemeldet werden, bleibt bewusst im Live-Tracker: sie gehoert zu
   der Liste, die sie filtert, und wird dort gegengeprueft ("3 passende Risse
   jetzt aktiv"). Hier stehen nur Schalter, die immer gelten.
   ========================================================================= */

let hotkeyState = null;
let capturingHotkey = null;

const HOTKEY_LABELS = {
  overlay:  'Overlay ein-/ausblenden',
  interact: 'Mauszeiger ins Overlay holen'
};

/* Sondertasten, deren e.key nicht der Schreibweise von Electron entspricht. */
const ACCEL_NAMED = {
  ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
  ' ': 'Space', Enter: 'Return', Backspace: 'Backspace', Delete: 'Delete',
  Insert: 'Insert', Home: 'Home', End: 'End', PageUp: 'PageUp',
  PageDown: 'PageDown', Tab: 'Tab'
};

function accelKeyName(e) {
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return null;
  if (ACCEL_NAMED[e.key]) return ACCEL_NAMED[e.key];
  if (/^F\d{1,2}$/.test(e.key)) return e.key;
  if (/^[a-z0-9]$/i.test(e.key)) return e.key.toUpperCase();
  /* Bei allem anderen haengt e.key vom Tastaturlayout ab - e.code benennt die
     physische Taste, und die registriert Windows. */
  const m = /^(?:Digit|Key)([A-Z0-9])$/.exec(e.code || '');
  return m ? m[1] : null;
}

/** Electron-Schreibweise ("Ctrl+Shift+R"), oder null wenn unbrauchbar. */
function accelFromEvent(e) {
  const key = accelKeyName(e);
  if (!key) return null;

  const mods = [];
  if (e.ctrlKey)  mods.push('Ctrl');
  if (e.altKey)   mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  if (e.metaKey)  mods.push('Super');

  /* Ohne Modifikator waere die Taste systemweit weg - auch im Chat, auch im
     Spiel. Das ist kein Kuerzel mehr, das ist ein Ausfall. */
  if (!mods.length) return null;

  return [...mods, key].join('+');
}

function renderHotkeys() {
  for (const name of Object.keys(HOTKEY_LABELS)) {
    const btn = document.querySelector(`.hotkey-btn[data-hotkey="${name}"]`);
    if (!btn) continue;

    if (capturingHotkey === name) {
      btn.classList.add('capturing');
      btn.textContent = 'Taste drücken …';
      continue;
    }

    btn.classList.remove('capturing');
    const accel = (hotkeyState && hotkeyState[name]) || '—';
    btn.innerHTML = accel.split('+')
      .map(k => `<kbd>${esc(k)}</kbd>`)
      .join('<span class="hk-plus">+</span>');
  }
  renderHotkeyHint(hotkeyState);
}

function setHotkeyStatus(kind, text) {
  const el = $('hk-status');
  if (!el) return;
  el.className = 'settings-note ' + (kind || '');
  el.textContent = text || '';
  el.classList.toggle('hidden', !text);
}

function startHotkeyCapture(name) {
  capturingHotkey = name;
  renderHotkeys();
  setHotkeyStatus('', 'Kombination drücken — mindestens Strg, Alt oder Shift muss dabei sein. Esc bricht ab.');
}

function cancelHotkeyCapture() {
  capturingHotkey = null;
  renderHotkeys();
  setHotkeyStatus('', '');
}

async function saveHotkey(name, accelerator) {
  capturingHotkey = null;
  const res = await window.api.setHotkeys({ [name]: accelerator });
  hotkeyState = (res && res.hotkeys) || hotkeyState;
  renderHotkeys();

  const rejected = ((res && res.failed) || []).some(f => f.name === name);
  if (rejected) {
    setHotkeyStatus('warn',
      `${accelerator} ließ sich nicht registrieren — die Kombination ist systemweit `
      + `schon vergeben (häufig Discord, GeForce Experience oder ein anderes Overlay). `
      + `Es gilt weiter ${hotkeyState[name]}.`);
  } else {
    setHotkeyStatus('ok', `${HOTKEY_LABELS[name]}: ${accelerator}`);
  }
}

document.querySelectorAll('.hotkey-btn').forEach(btn => {
  btn.onclick = () => startHotkeyCapture(btn.dataset.hotkey);
});

/* Erfassungsphase: sonst schluckt der gerade angeklickte Knopf die Leertaste
   oder ein Eingabefeld den Buchstaben, bevor er hier ankommt. */
window.addEventListener('keydown', e => {
  if (!capturingHotkey) return;
  e.preventDefault();
  e.stopPropagation();

  if (e.key === 'Escape') { cancelHotkeyCapture(); return; }

  const accel = accelFromEvent(e);
  if (!accel) return;              // nur Modifikatoren - weiter warten
  saveHotkey(capturingHotkey, accel);
}, true);

/* ---------------- Benachrichtigungs-Schalter ---------------- */

function renderNotifToggles() {
  const s = notificationSettings || {};
  const on = s.enabled !== false && s.fissures?.enabled !== false;
  if ($('set-notif-enabled')) $('set-notif-enabled').checked = on;
  if ($('set-notif-sound'))   $('set-notif-sound').checked   = s.sound !== false;
  if ($('set-notif-toast'))   $('set-notif-toast').checked   = s.desktopToast !== false;
}

/* Eigener Schalter, eigene Ablage: das Einblenden bei Relikt-Funden haengt am
   Overlay, nicht an den Benachrichtigungen, und liegt deshalb in config.json
   statt bei den Melde-Einstellungen. */
function renderRelicToggle(on, scan, tags) {
  if ($('set-relic-autoshow')) $('set-relic-autoshow').checked = on !== false;
  if ($('set-relic-scan'))     $('set-relic-scan').checked     = scan !== false;
  if ($('set-relic-tags'))     $('set-relic-tags').checked     = tags !== false;
}

$('set-relic-autoshow')?.addEventListener('change', e => {
  window.api.setRelicAutoShow(e.target.checked).catch(() => {});
});

$('set-relic-scan')?.addEventListener('change', e => {
  window.api.setRelicScan(e.target.checked).catch(() => {});
});

$('set-relic-tags')?.addEventListener('change', e => {
  window.api.setRelicTags(e.target.checked).catch(() => {});
});

async function saveNotifToggles() {
  const enabled = $('set-notif-enabled').checked;
  /* Ein Schalter, zwei Ebenen: enabled und fissures.enabled hingen schon im
     alten Modal an derselben Zeile. */
  const res = await window.api.saveNotifications({
    enabled,
    sound: $('set-notif-sound').checked,
    desktopToast: $('set-notif-toast').checked,
    fissures: { enabled }
  });
  if (res.ok) {
    notificationSettings = res.data;
    updateNotificationButtonState();
    renderNotifToggles();
  }
}

['set-notif-enabled', 'set-notif-sound', 'set-notif-toast'].forEach(id => {
  $(id)?.addEventListener('change', saveNotifToggles);
});

$('set-open-fissure-notif')?.addEventListener('click', () => {
  showTab('worldstate');
  showWsPane('fissures');
  openNotificationModal();
});

async function loadSettingsTab() {
  try {
    const res = await window.api.getSettings();
    if (res && res.ok) {
      hotkeyState = res.hotkeys;
      if (res.notifications) notificationSettings = res.notifications;
      renderRelicToggle(res.relicAutoShow, res.relicScan, res.relicTags);
    }
  } catch (err) {
    setHotkeyStatus('warn', 'Einstellungen konnten nicht gelesen werden: ' + err.message);
  }
  renderHotkeys();
  renderNotifToggles();
}
