/**
 * Die gefuehrte Tour durch Argus - einmal beim ersten Start, danach auf Wunsch.
 *
 * WARUM EIN SCHEINWERFER UND KEIN TEXTFENSTER:
 *   Neun Reiter, in jedem drei bis fuenf Ansichten. Eine Seite Text darueber
 *   liest niemand, und wer sie liest, muss die Begriffe danach erst wieder in
 *   der Oberflaeche suchen. Deshalb zeigt jede Station auf das Stueck Fenster,
 *   von dem sie redet: der Reiter wird umgeschaltet, die Stelle ausgeschnitten,
 *   der Text steht daneben. Was erklaert wird, ist dabei zu sehen.
 *
 * DER AUSSCHNITT LIEGT IN EINER SVG-MASKE und nicht in einem box-shadow-Ring.
 *   Mit dem Schatten-Trick geht genau ein Loch; wo sich zwei ueberlappen,
 *   verdoppelt sich die Abdunklung und es entsteht ein dunkler Fleck zwischen
 *   den Zielen. Eine Maske nimmt beliebig viele Loecher, und sie sind alle
 *   gleich hell - der Overlay-Schritt zeigt auf zwei Dinge gleichzeitig
 *   (Knopf und Tastenkuerzel), und die stehen nicht nebeneinander.
 *
 * ALLE ZIELE WERDEN BEI JEDEM AUFBAU NEU GESUCHT. Die Reiter zeichnen sich
 * nach einem Abruf komplett neu (innerHTML), eine beim Start gemerkte
 * Element-Referenz zeigt danach ins Nichts. Fehlt ein Ziel ganz - weil der
 * Bereich leer ist oder noch laedt -, faellt die Station auf einen mittigen
 * Kasten ohne Ausschnitt zurueck, statt auf einen Punkt in der Ecke zu zeigen.
 *
 * NICHTS HIER FASST DIE ANWENDUNG AN. Die Tour schaltet Reiter um (showTab und
 * die beiden Unteransichten) und liest Geometrie - sie klickt nichts, sie
 * aendert keine Einstellung, und sie laesst auch keinen Klick zum Fenster
 * darunter durch. Wer waehrenddessen etwas ausprobieren will, beendet sie.
 */
const Guide = (() => {

  /* Muss zur Breite von .guide-box in style.css passen: der Kasten wird vor
     dem ersten Zeichnen platziert, da gibt es noch keine gemessene Breite. */
  const BOX_W = 392;
  const GAP   = 18;   // zwischen Ausschnitt und Kasten
  const EDGE  = 18;   // Mindestabstand zum Fensterrand

  /* ---------------- Die Stationen ----------------

     tab / wsPane / masteryMode schalten vor dem Messen um - ein Ziel in einem
     versteckten Reiter hat keine Geometrie. target ist ein Auswaehler oder
     eine Liste davon; die erste gefundene Stelle traegt den Pfeil, alle
     zusammen bilden den Ausschnitt. place ist ein Wunsch, kein Befehl: passt
     die Seite nicht ins Fenster, sucht sich der Kasten eine andere. */
  const STEPS = [
    {
      id: 'welcome',
      tab: 'worldstate',
      target: null,
      place: 'center',
      title: 'Welcome to Argus',
      body: `
        <p>Argus reads your Warframe account and the game’s world state, and works
           out what is worth doing next — mastery, relics, ducats, trades and
           farming routes.</p>
        <p>This tour walks through every part of the window and takes about a
           minute. It only looks and explains: nothing is switched on, and no
           setting is changed behind your back.</p>
        <p class="guide-keys">
          <span><kbd>→</kbd> next</span>
          <span><kbd>←</kbd> back</span>
          <span><kbd>Esc</kbd> end it</span>
        </p>`
    },
    {
      id: 'sidebar',
      tab: 'worldstate',
      target: '.sidebar-nav',
      place: 'right',
      pad: 6,
      title: 'Everything lives in this rail',
      body: `
        <p>Eight tabs, top to bottom, roughly in the order you need them: what is
           happening <em>right now</em>, what resets <em>this week</em>, what you
           still have to master, and what you own.</p>
        <p>Hover over an icon and it says what is behind it. Settings sits on its
           own at the bottom.</p>`
    },
    {
      id: 'hero',
      tab: 'worldstate',
      target: '.hero',
      place: 'bottom',
      title: 'Your profile, at a glance',
      body: `
        <p>Your mastery rank, how far you are into the next one, and how much of
           the theoretical maximum you have already taken.</p>
        <p>The bar on the right splits your mastery XP by where it came from —
           Warframes, primaries, secondaries, melee and the rest. That is the
           quickest way to see which category still has cheap points in it.</p>
        <p><b>Refresh profile</b> fetches it from Warframe’s servers again. It is
           rate-limited on purpose: too many requests in a row get your IP
           throttled, and that locks you out of the game’s login too.</p>`
    },
    {
      id: 'worldstate',
      tab: 'worldstate',
      wsPane: 'overview',
      target: '#ws-nav',
      place: 'bottom',
      title: 'Live tracker',
      body: `
        <p>The world state as the game itself reports it: open-world day and night
           cycles, Baro’s countdown, the daily sortie, the Archon hunt, Nightwave
           acts, alerts, invasions, syndicate bounties and Steel Path.</p>
        <p>These sub-tabs split it up, and the number on each one says how much is
           currently in there — a grey zero means there is nothing to look at.</p>`
    },
    {
      id: 'fissures',
      tab: 'worldstate',
      wsPane: 'fissures',
      target: '.ws-fissure-actions',
      place: 'bottom',
      title: 'Void fissures — and being told about them',
      body: `
        <p>Every open fissure with its mission type, its node and how long it still
           runs. The era chips filter the list down to the relics you actually
           hold.</p>
        <p><b>Notifications</b> decides which of them are worth interrupting you
           for: tiers, mission types, Steel Path. Argus looks for new ones every
           45 seconds and can raise a Windows notification — the one channel that
           still reaches you mid-mission.</p>`
    },
    {
      id: 'weekly',
      tab: 'weekly',
      target: '#weekly-reset',
      place: 'bottom',
      title: 'What resets this week',
      body: `
        <p>Archon hunt, the Circuit, Deep Archimedea, Netracells and the weekly
           vendor stock, with the countdown to the reset on top.</p>
        <p>Whatever Argus can read from your own game data is ticked off by
           itself; everything else you tick off by hand. Nothing on this page is
           guessed — where it cannot be known, it says so.</p>`
    },
    {
      id: 'mastery',
      tab: 'mastery',
      masteryMode: 'manager',
      target: '#tab-mastery .ducats-mode-tabs',
      place: 'bottom',
      title: 'Mastery & farming goals',
      body: `
        <p>Four views on the same question — what is worth building next.</p>
        <p><b>Manager</b> holds your open goals with the materials each one still
           needs, plus recommendations. <b>Catalogue</b> is every item in the game,
           filterable by category and status; a click on a tile shows its drop
           sources and makes it a goal. <b>Foundry</b> is what is building, when it
           is done, and what is finished and waiting for you. <b>Vendors</b> covers
           the Warframes you buy rather than farm.</p>`
    },
    {
      id: 'inventory',
      tab: 'inventory',
      target: ['#tab-inventory .section-head-row'],
      place: 'bottom',
      title: 'Your inventory',
      body: `
        <p>Relics, mods, arcanes, materials, blueprints and your currencies.</p>
        <p>Your public Warframe profile contains none of this. To show it, Argus
           reads the inventory the running game already holds in its own memory —
           read-only, never writing, and it never leaves this machine.</p>
        <p>That is off until you switch it on yourself, in Settings under
           <b>Inventory access</b>. Everything else in Argus works without it.</p>`
    },
    {
      id: 'ducats',
      tab: 'ducats',
      target: '#tab-ducats .ducats-mode-tabs',
      place: 'bottom',
      title: 'Baro & ducats',
      body: `
        <p>What your prime parts are worth in ducats, and what the same parts are
           worth in platinum. The two rarely agree, and that gap is the whole point
           of this tab: it tells you what to melt down and what to sell.</p>
        <p>The <b>relic planner</b> works backwards from a part to the relics that
           drop it, and <b>Baro’s offer</b> shows what is on his list this visit and
           how much of it you already own.</p>`
    },
    {
      id: 'trading',
      tab: 'trading',
      target: '#trade-stats',
      place: 'bottom',
      title: 'Trading',
      body: `
        <p>This tab is warframe.market, not the game: your open buy and sell orders,
           your riven contracts, and every trade you have logged, with 30-day
           totals. Sign in with your market account through the button at the top
           right.</p>
        <p>Argus never messages anyone for you. Trade chat lines are copied to your
           clipboard and you send them yourself, in the game — a program that
           writes to strangers on its own is a bot, however politely it words it.</p>`
    },
    {
      id: 'builds',
      tab: 'builds',
      target: '.barsenal-tools',
      place: 'bottom',
      title: 'Builds',
      body: `
        <p>Paste an overframe.gg link and the build lands in your arsenal with its
           mods, ranks, polarities and arcanes. Argus adds up the forma, catalysts
           and endo across all of them, and — if it can see your inventory — lists
           the mods you are still missing.</p>
        <p>Marked as work in progress on purpose: it is usable, but not finished.</p>`
    },
    {
      id: 'farmguide',
      tab: 'farmguide',
      target: '.fg-modes',
      place: 'bottom',
      title: 'Farming guide',
      body: `
        <p>For every resource: the best node to farm it on, the mission type behind
           it, and the squad setup that roughly doubles what a run yields.</p>
        <p>The second mode covers mining — every ore and gem, which world and which
           kind of vein it sits in, and which cutter you want for it.</p>`
    },
    {
      id: 'notes',
      tab: 'notes',
      target: '#general-notes',
      place: 'bottom',
      title: 'Notebook',
      body: `
        <p>A plain text field that saves itself as you type, plus the notes you
           leave on individual items elsewhere in Argus, collected in one place.</p>
        <p>It stays on this machine, like everything else Argus stores.</p>`
    },
    {
      id: 'overlay',
      tab: 'worldstate',
      target: ['#btn-overlay', '#hotkey-hint'],
      place: 'bottom',
      pad: 6,
      title: 'The overlay, on top of the game',
      body: `
        <p>A second window that lays your relics, cycles, fissures and goals over
           the running game. The hotkey shown next to the button brings it up and
           takes it away again; a second one lets go of the cursor so you can click
           inside it, and <kbd>Esc</kbd> hands the cursor back to the game.</p>
        <p>It can also appear by itself the moment a relic reward screen opens, with
           the name, platinum price and ducat value of what is on offer. All of it
           can be switched off.</p>`
    },
    {
      id: 'settings',
      tab: 'settings',
      target: '#guide-settings-group',
      /* Die Gruppe steht in der LINKEN Spalte - daneben heisst also rechts.
         Links davon liegt nur die schmale Sidebar, da passt nichts hin. */
      place: 'right',
      title: 'Settings — and this tour',
      body: `
        <p>Hotkeys, notifications, the overlay windows, inventory access and which
           version you are running.</p>
        <p>If you want your inventory, the Baro planner and the weekly tracking to
           do anything, <b>Inventory access</b> in this tab is the switch that turns
           them on.</p>
        <p>And this tour: <b>Start the tour</b>, right here, runs it again whenever
           you like.</p>`
    }
  ];

  /* ---------------- Zustand ---------------- */
  let layer = null;      // die ganze Schicht
  let maskEl = null;     // <mask>, nimmt die Loecher auf
  let ringBox = null;    // Wirt der Markierungsrahmen
  let box = null;        // der Textkasten
  let arrow = null;
  let at = 0;
  let open = false;
  /* Die zuletzt gezeichnete Geometrie, als Zeichenkette. null heisst
     "ungueltig" und erzwingt den naechsten Aufbau - die leere Zeichenkette
     ist ein gueltiger Wert (Station ohne Ziel) und darf das nicht tun. */
  let lastSig = null;
  let watchdog = null;

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const q = sel => { try { return document.querySelector(sel); } catch { return null; } };

  /* ---------------- Aufbau ---------------- */

  /**
   * Die Schicht wird einmal gebaut und danach nur noch ein- und ausgeblendet.
   * Sie haengt an <body> und nicht im Anwendungsbereich: dort haette sie einen
   * Scroll-Vorfahren, und ein position:fixed mit Filter darueber waere daran
   * haengen geblieben.
   */
  function mount() {
    if (layer) return;

    layer = document.createElement('div');
    layer.className = 'guide-layer hidden';
    layer.innerHTML = `
      <svg class="guide-mask" aria-hidden="true">
        <defs>
          <mask id="guide-cutout" maskUnits="userSpaceOnUse">
            <rect x="0" y="0" width="100%" height="100%" fill="#fff"></rect>
          </mask>
        </defs>
        <rect x="0" y="0" width="100%" height="100%" class="guide-dim"
              mask="url(#guide-cutout)"></rect>
      </svg>

      <div class="guide-rings" aria-hidden="true"></div>

      <div class="guide-box" role="dialog" aria-modal="true" aria-labelledby="guide-title">
        <div class="guide-arrow" aria-hidden="true"></div>

        <div class="guide-top">
          <span class="guide-count" id="guide-count"></span>
          <button type="button" class="guide-skip" id="guide-skip">Skip tour</button>
        </div>

        <div class="guide-rail" aria-hidden="true"><i id="guide-rail-fill"></i></div>

        <h3 id="guide-title"></h3>
        <div class="guide-text" id="guide-text"></div>

        <div class="guide-foot">
          <button type="button" class="btn-sm" id="guide-back">Back</button>
          <button type="button" class="btn btn-primary" id="guide-next">Next</button>
        </div>
      </div>`;

    document.body.appendChild(layer);

    maskEl  = layer.querySelector('#guide-cutout');
    ringBox = layer.querySelector('.guide-rings');
    box     = layer.querySelector('.guide-box');
    arrow   = layer.querySelector('.guide-arrow');

    layer.querySelector('#guide-next').onclick = () => step(+1);
    layer.querySelector('#guide-back').onclick = () => step(-1);
    layer.querySelector('#guide-skip').onclick = () => stop();

    /* Ein Klick auf die abgedunkelte Flaeche tut NICHTS. Er soll weder weiter-
       schalten (zu leicht aus Versehen) noch zur Anwendung durchfallen (dann
       waere die Tour nur eine Folie ueber einem Fenster, das man bedienen
       kann, und die naechste Station zeigte auf etwas anderes als erklaert). */
    layer.addEventListener('mousedown', e => {
      if (!e.target.closest('.guide-box')) e.preventDefault();
    });
  }

  /* ---------------- Ziele finden und messen ---------------- */

  /** Sichtbar heisst: im Baum, nicht versteckt, und mit echter Flaeche. */
  function rectOf(el) {
    if (!el || !el.isConnected) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return null;
    return r;
  }

  function targetsOf(step) {
    const list = !step.target ? []
               : Array.isArray(step.target) ? step.target : [step.target];
    return list.map(q).map(rectOf).filter(Boolean);
  }

  /**
   * Den Bereich in den sichtbaren Teil rollen - aber nur so weit wie noetig.
   *
   * Nicht scrollIntoView: das zentriert immer, also springt die Seite auch
   * dann, wenn das Ziel laengst dasteht. Ein Fenster, das bei jedem Klick auf
   * "Weiter" ruckt, sieht kaputt aus, auch wenn es richtig rechnet.
   */
  function bringIntoView(el) {
    const scroller = el && el.closest('.main-content');
    if (!scroller) return;
    const er = el.getBoundingClientRect();
    const sr = scroller.getBoundingClientRect();
    const m  = 90;   // Luft, damit der Kasten darunter noch Platz hat
    if (er.top < sr.top + m)            scroller.scrollTop -= (sr.top + m - er.top);
    else if (er.bottom > sr.bottom - m) scroller.scrollTop += (er.bottom - (sr.bottom - m));
  }

  /* ---------------- Ausschnitt & Markierung ----------------

     Eine Stelle wird zu einem Fleck: Rechteck plus Luft ringsum, mit dem
     Radius, den die kurze Kante hergibt. soft unterscheidet den Reiter in der
     Leiste ("du bist hier") vom eigentlichen Gegenstand der Station ("sieh
     hier hin") - siehe .guide-ring.is-soft in style.css. */
  const spotOf = (r, pad, soft = false) => {
    const x = r.left - pad, y = r.top - pad;
    const w = r.width + pad * 2, h = r.height + pad * 2;
    return { x, y, w, h, rad: Math.min(16, h / 2, w / 2), soft };
  };

  function paintHoles(spots) {
    /* Nur die Loecher weg, das weisse Grundrechteck bleibt stehen. */
    [...maskEl.querySelectorAll('.guide-hole')].forEach(n => n.remove());
    ringBox.innerHTML = '';

    for (const s of spots) {
      const hole = document.createElementNS(SVG_NS, 'rect');
      hole.setAttribute('class', 'guide-hole');
      hole.setAttribute('x', s.x); hole.setAttribute('y', s.y);
      hole.setAttribute('width', s.w); hole.setAttribute('height', s.h);
      hole.setAttribute('rx', s.rad); hole.setAttribute('ry', s.rad);
      hole.setAttribute('fill', '#000');
      maskEl.appendChild(hole);

      const ring = document.createElement('div');
      ring.className = 'guide-ring' + (s.soft ? ' is-soft' : '');
      ring.style.cssText =
        `left:${s.x}px;top:${s.y}px;width:${s.w}px;height:${s.h}px;border-radius:${s.rad}px`;
      ringBox.appendChild(ring);
    }
  }

  /** Liegt b vollstaendig in a? Dann ist eine zweite Markierung Doppelung. */
  const contains = (a, b) =>
    a.left <= b.left && a.top <= b.top && a.right >= b.right && a.bottom >= b.bottom;

  /* ---------------- Den Kasten hinstellen ---------------- */

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  /**
   * Die Wunschseite zuerst, danach der Reihe nach die anderen. Passt keine,
   * steht der Kasten mittig - das ist immer noch besser als ein Kasten, der
   * halb aus dem Fenster haengt und dessen "Weiter" man nicht mehr trifft.
   */
  function place(area, prefer) {
    const bw = box.offsetWidth  || BOX_W;
    const bh = box.offsetHeight || 220;
    const vw = window.innerWidth, vh = window.innerHeight;

    if (!area || prefer === 'center') {
      return { side: 'center', x: (vw - bw) / 2, y: (vh - bh) / 2 };
    }

    const cx = area.left + area.width / 2;
    const cy = area.top + area.height / 2;
    const order = [prefer, 'bottom', 'right', 'left', 'top']
      .filter((s, i, a) => a.indexOf(s) === i);

    for (const side of order) {
      if (side === 'bottom') {
        const y = area.bottom + GAP;
        if (y + bh <= vh - EDGE)
          return { side, x: clamp(cx - bw / 2, EDGE, vw - bw - EDGE), y };
      }
      if (side === 'top') {
        const y = area.top - GAP - bh;
        if (y >= EDGE)
          return { side, x: clamp(cx - bw / 2, EDGE, vw - bw - EDGE), y };
      }
      if (side === 'right') {
        const x = area.right + GAP;
        if (x + bw <= vw - EDGE)
          return { side, x, y: clamp(cy - bh / 2, EDGE, vh - bh - EDGE) };
      }
      if (side === 'left') {
        const x = area.left - GAP - bw;
        if (x >= EDGE)
          return { side, x, y: clamp(cy - bh / 2, EDGE, vh - bh - EDGE) };
      }
    }
    return { side: 'center', x: (vw - bw) / 2, y: (vh - bh) / 2 };
  }

  const sigOf = rects => rects.map(r =>
    [r.left, r.top, r.width, r.height].map(Math.round).join()).join('|');

  /**
   * Geometrie neu rechnen. Laeuft nach jedem Schritt, beim Rollen, beim
   * Groessenwechsel und im Takt des Waechters - die Ziele werden dabei JEDES
   * MAL neu gesucht, weil die Reiter sich nach einem Abruf komplett neu
   * zeichnen.
   *
   * Der Vergleich mit dem letzten Stand ist kein Feinschliff, sondern der
   * Grund, warum der Waechter viermal in der Sekunde laufen darf: gemessen
   * wird immer, gezeichnet nur, wenn sich etwas bewegt hat.
   */
  function layout() {
    if (!open) return;
    const st = STEPS[at];
    const pad = st.pad ?? 10;
    const rects = targetsOf(st);

    /* DER REITER IN DER LEISTE BLEIBT SICHTBAR.
       showTab setzt die aktive Kennzeichnung ohnehin - aber unter der
       Abdunklung ist gerade sie nicht mehr zu erkennen, und damit verliert
       man waehrend der Tour genau die Anzeige, die sagt, wo man ist. Also
       bekommt er ein eigenes Loch.

       Er zaehlt NICHT zum Bereich, nach dem sich der Kasten ausrichtet: sonst
       spannte der sich von der Leiste ganz links bis zum Ziel im Inhalt, und
       der Kasten landete irgendwo in der Mitte dazwischen. Und wo die Station
       ohnehin auf die Leiste zeigt, faellt die zweite Markierung weg. */
    const navEl = st.tab ? q(`.nav-item[data-tab="${st.tab}"]`) : null;
    let navRect = rectOf(navEl);
    if (navRect && rects.some(r => contains(r, navRect))) navRect = null;

    const sig = sigOf(navRect ? [...rects, navRect] : rects);
    if (sig === lastSig) return;
    lastSig = sig;

    const spots = rects.map(r => spotOf(r, pad));
    if (navRect) {
      /* RINGSUM GLEICH VIEL, und das ist hier keine Schoenheitsfrage.
         Die aktive Kennzeichnung hat noch einen Akzentbalken (ein ::before),
         der 10px LINKS neben dem Knopf sitzt und nicht zu dessen Rechteck
         zaehlt. Ihn mit aufzunehmen hiesse, den Rahmen nach links zu ziehen -
         dann steht die Kachel nicht mehr in seiner Mitte, und das sieht aus
         wie ein Rechenfehler, nicht wie eine Markierung. Der Balken bleibt
         also draussen; gemeint ist ohnehin die Kachel.

         Der Radius folgt dem der Kachel plus Abstand, damit die beiden Ecken
         parallel laufen - ein fester Wert saehe nur auf einer der beiden
         Kanten richtig aus. */
      const slot = spotOf(navRect, 6, true);
      const kachel = parseFloat(getComputedStyle(navEl).borderTopLeftRadius) || 0;
      slot.rad = Math.min(kachel + 6, slot.w / 2, slot.h / 2);
      spots.push(slot);
    }
    paintHoles(spots);

    let area = null;
    if (rects.length) {
      const left   = Math.min(...rects.map(r => r.left))   - pad;
      const top    = Math.min(...rects.map(r => r.top))    - pad;
      const right  = Math.max(...rects.map(r => r.right))  + pad;
      const bottom = Math.max(...rects.map(r => r.bottom)) + pad;
      area = { left, top, right, bottom, width: right - left, height: bottom - top };
    }

    const pos = place(area, rects.length ? (st.place || 'bottom') : 'center');
    box.style.left = pos.x + 'px';
    box.style.top  = pos.y + 'px';
    box.dataset.side = pos.side;

    /* Der Pfeil zeigt auf die ERSTE Stelle, nicht auf die Mitte aller: bei
       zwei weit auseinander liegenden Zielen laege die Mitte zwischen ihnen,
       also auf nichts. */
    if (pos.side === 'center' || !rects.length) {
      arrow.style.display = 'none';
    } else {
      const r0 = rects[0];
      arrow.style.display = '';
      arrow.style.left = arrow.style.top = '';
      if (pos.side === 'top' || pos.side === 'bottom') {
        arrow.style.left = clamp(r0.left + r0.width / 2 - pos.x,
                                 26, (box.offsetWidth || BOX_W) - 26) + 'px';
      } else {
        arrow.style.top = clamp(r0.top + r0.height / 2 - pos.y,
                                26, (box.offsetHeight || 220) - 26) + 'px';
      }
    }
  }

  /* ---------------- Stationen durchgehen ---------------- */

  function fill() {
    const st = STEPS[at];
    layer.querySelector('#guide-title').innerHTML = st.title;
    layer.querySelector('#guide-text').innerHTML  = st.body;
    layer.querySelector('#guide-count').textContent = `${at + 1} of ${STEPS.length}`;
    layer.querySelector('#guide-rail-fill').style.width =
      ((at + 1) / STEPS.length * 100).toFixed(1) + '%';

    layer.querySelector('#guide-back').disabled = at === 0;
    const next = layer.querySelector('#guide-next');
    next.textContent = at === STEPS.length - 1 ? 'Done' : 'Next';

    box.classList.remove('is-in');
    /* Neu anstossen, damit die Einblendung bei jeder Station wieder laeuft -
       ohne den erzwungenen Umbruch behaelt der Browser die alte Animation. */
    void box.offsetWidth;
    box.classList.add('is-in');
  }

  function show() {
    const st = STEPS[at];

    if (st.tab && typeof window.showTab === 'function') window.showTab(st.tab);
    if (st.wsPane && typeof window.showWsPane === 'function') window.showWsPane(st.wsPane);
    if (st.masteryMode && typeof window.setMasteryMode === 'function')
      window.setMasteryMode(st.masteryMode);

    fill();

    /* Die Hoehe des Kastens hat sich mit dem Text geaendert - was vorher
       gemessen wurde, gilt nicht mehr. */
    lastSig = null;

    requestAnimationFrame(() => {
      const first = !st.target ? null
                  : q(Array.isArray(st.target) ? st.target[0] : st.target);
      if (first) bringIntoView(first);
      layout();
    });
  }

  function step(dir) {
    const next = at + dir;
    if (next < 0) return;
    if (next >= STEPS.length) return stop();
    at = next;
    show();
  }

  /* ---------------- Tastatur ---------------- */

  /* In der Erfassungsphase und mit stopPropagation: die Anwendung hat mehrere
     eigene Escape-Behandlungen (Modale, Build-Ansicht), und die sollen nicht
     nebenher zuschlagen, waehrend die Tour laeuft. */
  function onKey(e) {
    if (!open) return;
    const k = e.key;
    if (k === 'Escape')                       { e.preventDefault(); e.stopPropagation(); stop(); }
    else if (k === 'ArrowRight' || k === 'Enter' || k === ' ')
                                              { e.preventDefault(); e.stopPropagation(); step(+1); }
    else if (k === 'ArrowLeft')               { e.preventDefault(); e.stopPropagation(); step(-1); }
  }

  const onScroll = () => layout();

  /* Beim Groessenwechsel wird IMMER neu gesetzt, auch wenn sich kein Ziel
     bewegt hat: eine Station ohne Ziel steht mittig, und die Mitte ist nach
     einem Groessenwechsel woanders - der Vergleich sieht davon nichts. */
  const onResize = () => { lastSig = null; layout(); };

  /* ---------------- Oeffnen und Schliessen ---------------- */

  function start(from = 0) {
    mount();
    if (open) { at = clamp(from, 0, STEPS.length - 1); show(); return; }

    open = true;
    at = clamp(from, 0, STEPS.length - 1);
    layer.classList.remove('hidden');
    document.body.classList.add('guide-on');

    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onResize);
    document.querySelector('.main-content')?.addEventListener('scroll', onScroll, { passive: true });

    /* Der Waechter.
       Ein Reiterwechsel stoesst Abrufe an, die Sekunden spaeter zurueckkommen
       und die halbe Seite neu setzen - Ereignisse gibt es dafuer keine. Ohne
       ihn stuende der Rahmen dann dort, wo das Ziel VORHER war, und das ist
       schlimmer als gar kein Rahmen: er zeigt auf etwas Falsches. Viermal in
       der Sekunde messen kostet nichts, gezeichnet wird ohnehin nur bei einer
       Aenderung. */
    watchdog = setInterval(layout, 250);

    show();
  }

  /**
   * Beenden heisst gesehen - egal ob durchgeklickt oder abgebrochen.
   *
   * Wer abbricht, hat entschieden, dass er das nicht braucht; ihn beim
   * naechsten Start wieder zu fragen, waere kein Angebot mehr, sondern
   * Quengeln. Der Knopf in den Einstellungen holt sie jederzeit zurueck.
   */
  function stop() {
    if (!open) return;
    open = false;
    layer.classList.add('hidden');
    document.body.classList.remove('guide-on');

    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', onResize);
    document.querySelector('.main-content')?.removeEventListener('scroll', onScroll);
    clearInterval(watchdog);
    watchdog = null;
    lastSig = null;

    try { window.api?.setGuideSeen?.(true); } catch { /* laeuft dann eben nochmal */ }
  }

  return {
    start,
    stop,
    get steps() { return STEPS.length; },
    get isOpen() { return open; }
  };
})();
