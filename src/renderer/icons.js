/* Inline-SVG-Icons für Argus
   Authentische Vektor-Glyphen im Warframe- / Tenno-Stil */

const svg = (paths, size = 16) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round"
        stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

const svgFilled = (paths, size = 16) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor"
        stroke="none" aria-hidden="true">${paths}</svg>`;

const Icon = {
  plus:     s => svg('<path d="M12 5v14M5 12h14"/>', s),
  check:    s => svg('<path d="M20 6 9 17l-5-5"/>', s),
  trash:    s => svg('<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6"/><path d="M10 11v6M14 11v6"/>', s),
  refresh:  s => svg('<path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>', s),
  search:   s => svg('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>', s),
  target:   s => svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>', s),
  layers:   s => svg('<path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>', s),
  note:     s => svg('<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8Z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>', s),
  grid:      s => svg('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>', s),
  dashboard: s => svg('<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>', s),
  radar:     s => svg('<circle cx="12" cy="12" r="9.5"/><circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12h2.5M19 12h2.5"/><path d="m12 12 6-6"/>', s),
  minus:     s => svg('<path d="M5 12h14"/>', s),
  close:    s => svg('<path d="M18 6 6 18M6 6l12 12"/>', s),

  /* Dasselbe Kreuz wie close, aber als ZUSTAND ("nicht vorhanden") statt als
     Handlung ("schliessen"). Eigener Name, weil die beiden sich unabhaengig
     voneinander aendern duerfen: wer den Schliessen-Knopf umzeichnet, meint
     nicht den Besitz-Filter im Inventar. */
  cross:    s => svg('<path d="M18 6 6 18M6 6l12 12"/>', s),
  pip:      s => svg('<rect x="3" y="4" width="18" height="16" rx="2"/><rect x="12" y="12" width="7" height="6" rx="1"/>', s),
  clock:    s => svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', s),
  coin:     s => svg('<circle cx="12" cy="12" r="9"/><path d="M15 9.5a3 3 0 0 0-3-1.5c-1.7 0-3 .9-3 2s1.3 2 3 2 3 .9 3 2-1.3 2-3 2a3 3 0 0 1-3-1.5"/>', s),
  chevron:  s => svg('<path d="m9 18 6-6-6-6"/>', s),
  users:    s => svg('<path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 20v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/>', s),
  calendar: s => svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>', s),
  star:     s => svg('<path d="m12 3 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 20.9l1.1-6.5L2.6 9.8l6.5-.9Z"/>', s),
  map:      s => svg('<path d="m9 4 6 2.5L21 4v15l-6 2.5L9 19l-6 2.5V6.5Z"/><path d="M9 4v15M15 6.5v15"/>', s),
  wrench:   s => svg('<path d="M14.7 6.3a4 4 0 0 1 5 5l-9.7 9.7a2.1 2.1 0 0 1-3-3l9.7-9.7Z"/><path d="M14.7 6.3 9.5 3.5 3 5l1.5 6.5 2.8 5.2"/>', s),
  bolt:     s => svg('<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>', s),
  cube:     s => svg('<path d="m12 2 9 5v10l-9 5-9-5V7l9-5Z"/><path d="m12 12 9-5M12 12v10M12 12 3 7"/>', s),
  /* Vorratskiste - Deckel, Korpus, Griffschlitz. Bewusst kantiger als cube,
     damit die beiden sich in der Seitenleiste nicht aehnlich sehen. */
  crate:    s => svg('<path d="M4 7.5h16L18.4 3.9a1 1 0 0 0-.9-.6h-11a1 1 0 0 0-.9.6L4 7.5Z"/><path d="M4 7.5h16v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-12Z"/><path d="M10 12h4"/>', s),
  link:     s => svg('<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>', s),
  /* Pfeil auf eine Ablagelinie - dasselbe Zeichen im Update-Abzeichen, im
     Kopf des Update-Fensters und auf dem Knopf darin. Ein Vorgang, ein
     Symbol; sonst sucht man beim zweiten Klick nach dem ersten. */
  download: s => svg('<path d="M12 3v11"/><path d="m7.5 10 4.5 4.5 4.5-4.5"/><path d="M4 20h16"/>', s),
  warning:  s => svg('<path d="M12 3 2 20h20L12 3Z"/><path d="M12 9v5M12 17.5v.5"/>', s),
  globe:    s => svg('<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20"/>', s),
  compass:  s => svg('<circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>', s),
  sun:      s => svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>', s),
  moon:     s => svg('<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>', s),
  snowflake:s => svg('<path d="M2 12h20M12 2v20M20 16l-4-4 4-4M4 8l4 4-4 4M16 4l-4 4-4-4M8 20l4-4 4 4"/>', s),
  flame:    s => svg('<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5Z"/>', s),

  /* Offizielle Warframe / Tenno In-Game Symbole */
  alert: s => svgFilled('<path fill-rule="evenodd" clip-rule="evenodd" d="M13.06 3.02a1.22 1.22 0 0 0-2.12 0L1.29 20.06A1.22 1.22 0 0 0 2.35 21.9h19.3a1.22 1.22 0 0 0 1.06-1.84L13.06 3.02ZM12 8.3a1.2 1.2 0 0 0-1.2 1.2v4.9a1.2 1.2 0 0 0 2.4 0V9.5A1.2 1.2 0 0 0 12 8.3Zm0 8.05a1.35 1.35 0 1 0 0 2.7 1.35 1.35 0 0 0 0-2.7Z"/>', s),
  inventory: s => `<span class="nav-icon-mask icon-inventory" style="width:${s}px;height:${s}px;" aria-hidden="true"></span>`,
  starchart: s => svg('<circle cx="12" cy="12" r="3"/><circle cx="19" cy="6" r="2"/><circle cx="5" cy="18" r="2"/><circle cx="19" cy="18" r="2"/><circle cx="5" cy="6" r="2"/><path d="M12 9V8M12 16v-1M9 12H8M16 12h-1M10 10 7 7M14 14l3 3M14 10l3-3M10 14l-3 3"/>', s),
  lotus: s => svg('<path d="M12 2.5C11.5 5.2 9.8 7.5 7.2 9c2.5.2 4.8 2 4.8 4.5 0-2.5 2.3-4.3 4.8-4.5-2.6-1.5-4.3-3.8-4.8-6.5Z"/><path d="M12 13.5v7.5"/><path d="M7 11.2C4.5 11.8 2.5 13.5 2 16c2.5 0 4.5-1 5.8-3Z"/><path d="M17 11.2c2.5.6 4.5 2.3 5 4.8-2.5 0-4.5-1-5.8-3Z"/><path d="M9 16c-2 1.2-3.5 3.2-4 5.5 2.5-.5 4.5-2 5-4.5Z"/><path d="M15 16c2 1.2 3.5 3.2 4 5.5-2.5-.5-4.5-2-5-4.5Z"/>', s),
  
  ducat: s => svg('<path d="m12 2 8 4.5v11L12 22l-8-4.5v-11L12 2Z"/><path d="m12 6.5 4.5 2.5v6L12 17.5 7.5 15V9L12 6.5Z"/><path d="M12 9.5v5M9.5 12h5"/>', s),
  
  /* Spuren des Nichts (Void Traces) */
  traces: s => svg('<path d="M12 2.5C12 2.5 5 10.5 5 15.5a7 7 0 0 0 14 0c0-5-7-13-7-13Z"/><path d="M12 6.5v11M8.5 13.5l3.5 4 3.5-4"/>', s),
  
  baro: s => svg('<path d="m12 2 8 4.5v11L12 22l-8-4.5v-11L12 2Z"/><path d="m12 6.5 4.5 2.5v6L12 17.5 7.5 15V9L12 6.5Z"/><circle cx="12" cy="12" r="2"/>', s),
  
  /* In-Game Relikt-Maske (Baro & Dukaten Tab und Relikt-Planer) */
  relic: s => `<span class="nav-icon-mask icon-relic" style="width:${s}px;height:${s}px;" aria-hidden="true"></span>`,
  
  /* Offizielles Nightwave-Emblem */
  nightwave: s => `<span class="nav-icon-mask icon-nightwave" style="width:${s}px;height:${s}px;" aria-hidden="true"></span>`,
  
  mastery: s => svg('<path d="m12 2 9 4.5v8c0 4.5-4 8-9 8.5-5-.5-9-4-9-8.5v-8L12 2Z"/><path d="m8.5 9.5 3.5 3.5 3.5-3.5M8.5 13.5 12 17l3.5-3.5"/>', s),

  /* Offizielles Upgrade- / Rang-Icon (Mastery Manager) */
  upgrade: s => `<span class="nav-icon-mask icon-upgrade" style="width:${s}px;height:${s}px;" aria-hidden="true"></span>`,

  /* MasteredIconHeavy - das Zeichen, das im Spiel an einem gemeisterten Item
     steht. In der Seitenleiste fuer "Mastery & farming goals". */
  mastered: s => `<span class="nav-icon-mask icon-mastered" style="width:${s}px;height:${s}px;" aria-hidden="true"></span>`,

  /* IconBiotics - das Ressourcen-Sinnbild aus den Item-Kategorien, passend
     zum Farming-Guide. */
  biotics: s => `<span class="nav-icon-mask icon-biotics" style="width:${s}px;height:${s}px;" aria-hidden="true"></span>`,

  /* Offizielles Checkmark-Icon (Farm-Ziele & Checkliste) */
  checkmark: s => `<span class="nav-icon-mask icon-checkmark" style="width:${s}px;height:${s}px;" aria-hidden="true"></span>`,
  trading: s => `<span class="nav-icon-mask icon-trading" style="width:${s}px;height:${s}px;" aria-hidden="true"></span>`,
  /* Eigener Name, statt Icon.calendar zu ersetzen: das dort ist ein
     13px-Zeichen mitten im Profiltext ("Since 2016 · 9.8 years"), und eine
     Seitenleisten-Maske traegt sich in dieser Groesse nicht. */
  weekly: s => `<span class="nav-icon-mask icon-calendar" style="width:${s}px;height:${s}px;" aria-hidden="true"></span>`,

  /* Offizielles Steel Path Emblem (Difficulty2.png) */
  steelpath: s => `<span class="nav-icon-mask icon-steelpath" style="width:${s}px;height:${s}px;" aria-hidden="true"></span>`,
  invasion: s => `<span class="nav-icon-mask icon-invasion" style="width:${s}px;height:${s}px;" aria-hidden="true"></span>`,
  events: s => `<span class="nav-icon-mask icon-events" style="width:${s}px;height:${s}px;" aria-hidden="true"></span>`,
  archon: s => `<span class="nav-icon-mask icon-archon" style="width:${s}px;height:${s}px;" aria-hidden="true"></span>`,
  syndicates: s => `<span class="nav-icon-mask icon-syndicates" style="width:${s}px;height:${s}px;" aria-hidden="true"></span>`,
  cetus: s => `<span class="nav-icon-mask icon-cetus" style="width:${s}px;height:${s}px;" aria-hidden="true"></span>`,
  solaris: s => `<span class="nav-icon-mask icon-solaris" style="width:${s}px;height:${s}px;" aria-hidden="true"></span>`,
  entrati: s => `<span class="nav-icon-mask icon-entrati" style="width:${s}px;height:${s}px;" aria-hidden="true"></span>`,
  zariman: s => `<span class="nav-icon-mask icon-zariman" style="width:${s}px;height:${s}px;" aria-hidden="true"></span>`,
  sun: s => `<span class="nav-icon-mask icon-sun" style="width:${s}px;height:${s}px;" aria-hidden="true"></span>`,
  moon: s => `<span class="nav-icon-mask icon-moon" style="width:${s}px;height:${s}px;" aria-hidden="true"></span>`,

  /* Offizielle Kategorie-Icons für Mastery Manager */
  catWarframe: s => `<span class="nav-icon-mask icon-cat-warframe" style="width:${s}px;height:${s}px;" aria-hidden="true"></span>`,
  catPrimary: s => `<span class="nav-icon-mask icon-cat-primary" style="width:${s}px;height:${s}px;" aria-hidden="true"></span>`,
  catSecondary: s => `<span class="nav-icon-mask icon-cat-secondary" style="width:${s}px;height:${s}px;" aria-hidden="true"></span>`,
  catMelee: s => `<span class="nav-icon-mask icon-cat-melee" style="width:${s}px;height:${s}px;" aria-hidden="true"></span>`,
  catCompanion: s => `<span class="nav-icon-mask icon-cat-companion" style="width:${s}px;height:${s}px;" aria-hidden="true"></span>`,
  catArchwing: s => `<span class="nav-icon-mask icon-cat-archwing" style="width:${s}px;height:${s}px;" aria-hidden="true"></span>`,
  catNecramech: s => `<span class="nav-icon-mask icon-cat-necramech" style="width:${s}px;height:${s}px;" aria-hidden="true"></span>`,
  catAmp: s => `<span class="nav-icon-mask icon-cat-amp" style="width:${s}px;height:${s}px;" aria-hidden="true"></span>`,
  catMaterials: s => `<span class="nav-icon-mask icon-cat-materials" style="width:${s}px;height:${s}px;" aria-hidden="true"></span>`,
  catMods: s => `<span class="nav-icon-mask icon-cat-mods" style="width:${s}px;height:${s}px;" aria-hidden="true"></span>`,
  
  forma: s => svg('<path d="M12 2v20M2 12h20M4.93 4.93l14.14 14.14M19.07 4.93 4.93 19.07"/><circle cx="12" cy="12" r="3.5"/>', s),
  
  /* Offizielles Primärwaffen- / Rifle-Kategorie-Icon */
  rifle: s => `<span class="nav-icon-mask icon-rifle" style="width:${s}px;height:${s}px;" aria-hidden="true"></span>`,
  
  codex: s => svg('<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M7 7h9M7 11h9M7 15h5"/><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>', s),
  
  bell: s => svg('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>', s),
  
  bellRing: s => svg('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/><path d="M4 2C2.8 3.7 2 5.7 2 8"/><path d="M22 8c0-2.3-.8-4.3-2-6"/>', s),
  
  volume: s => svg('<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>', s),
  
  sliders: s => svg('<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>', s),
  
  /* Symbole aus dem Schnellzugriff des Spiels. Eigene Namen statt der
     bestehenden relic/codex/rifle, weil die an anderen Stellen der
     Oberflaeche weiterlaufen - der Relikt-Planer etwa braucht sein
     Relikt-Symbol unabhaengig davon, was in der Seitenleiste steht. */
  qaBaro:       s => `<span class="nav-icon-mask icon-qa-baro" style="width:${s}px;height:${s}px;" aria-hidden="true"></span>`,
  qaNavigation: s => `<span class="nav-icon-mask icon-qa-navigation" style="width:${s}px;height:${s}px;" aria-hidden="true"></span>`,
  qaCodex:      s => `<span class="nav-icon-mask icon-qa-codex" style="width:${s}px;height:${s}px;" aria-hidden="true"></span>`,
  qaArsenal:    s => `<span class="nav-icon-mask icon-qa-arsenal" style="width:${s}px;height:${s}px;" aria-hidden="true"></span>`,
  qaSumbaat:    s => `<span class="nav-icon-mask icon-qa-sumbaat" style="width:${s}px;height:${s}px;" aria-hidden="true"></span>`,

  /* Wappen der fuenf Fokus-Schulen. Bewusst die Schulzeichen des Wikis
     (IconFocusClean*) und nicht die gleichnamigen Polaritaeten - die
     stehen fuer Mod-Steckplaetze und sehen voellig anders aus. */
  focusSchool: (s, school) => {
    const key = String(school || '').toLowerCase();
    if (!FOCUS_SCHOOLS.includes(key)) return Icon.star(s);
    return `<span class="nav-icon-mask icon-focus-${key}" style="width:${s}px;height:${s}px;" aria-hidden="true"></span>`;
  },

  /* Wortmarke: das Auge des Argus */
  argus: s => `<span class="nav-icon-mask icon-argus" style="width:${s}px;height:${s}px;" aria-hidden="true"></span>`,

  /* Ersetzen Emojis in der Oberflaeche. Emoji werden je nach System und
     Schriftart anders gezeichnet, tragen fremde Farben in ein abgestimmtes
     Farbschema und lassen sich nicht in der Groesse steuern - deshalb
     durchgehend Vektorglyphen wie der Rest der Oberflaeche. */
  bulb:   s => svg('<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2Z"/>', s),
  gem:    s => svg('<path d="M6 3h12l4 6-10 12L2 9Z"/><path d="M2 9h20"/><path d="m11 3-3 6 4 12 4-12-3-6"/>', s),
  rocket: s => svg('<path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2.1-.1-2.9a2.2 2.2 0 0 0-2.9-.1Z"/><path d="m12 15-3-3a22 22 0 0 1 2-4A12.9 12.9 0 0 1 22 2c0 2.7-.8 7.5-6 11a22 22 0 0 1-4 2Z"/><path d="M9 12H4s.6-3 2-4c1.6-1.1 5 0 5 0"/><path d="M12 15v5s3-.6 4-2c1.1-1.6 0-5 0-5"/>', s),
  copy:   s => svg('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>', s),

  /* Farm-Guide. pickaxe steht fuer den Bergbau-Modus, paw fuer den
     Begleiter-Hinweis, box fuer Behaelter - alle drei kommen dort in
     Fliesstext vor, wo vorher ein Emoji stand. */
  pickaxe: s => svg('<path d="M14.5 12.5 6.6 20.4a1 1 0 1 1-3-3l7.9-7.9"/><path d="M15.7 4.3A12.5 12.5 0 0 0 5.5 3a1 1 0 0 0 .1 1.8 22 22 0 0 1 6.3 3.4"/><path d="M17.7 3.7a1 1 0 0 0-1.4 0l-4.6 4.6a1 1 0 0 0 0 1.4l2.6 2.6a1 1 0 0 0 1.4 0l4.6-4.6a1 1 0 0 0 0-1.4Z"/><path d="M19.7 8.3a12.5 12.5 0 0 1 1.35 10.2 1 1 0 0 1-1.75-.1 22 22 0 0 0-3.4-6.3"/>', s),
  paw:     s => svg('<circle cx="7" cy="8" r="2"/><circle cx="12" cy="5.5" r="2"/><circle cx="17" cy="8" r="2"/><circle cx="19" cy="13.5" r="1.8"/><path d="M12 11c-2.5 0-4.5 2-5.5 4-.9 1.8.3 3.8 2.3 3.9 1 .1 2 .6 3.2.6s2.2-.5 3.2-.6c2-.1 3.2-2.1 2.3-3.9-1-2-3-4-5.5-4Z"/>', s),
  box:     s => svg('<path d="M3 8.5 12 4l9 4.5v7L12 20l-9-4.5Z"/><path d="M3 8.5 12 13l9-4.5M12 13v7"/>', s),

  /* Handelstab: die Knopfreihe einer Order. eye/eyeOff zeigen den
     Sichtbarkeitszustand AN, nicht die Aktion - ein durchgestrichenes Auge
     an einer sichtbaren Order liest sich sonst als "ist versteckt". */
  eye:    s => svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>', s),
  eyeOff: s => svg('<path d="M10.6 6.2A9.9 9.9 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3 3.6M6.6 6.7A17 17 0 0 0 2 12s3.5 6 10 6a9.7 9.7 0 0 0 4.3-1"/><path d="M14.1 14.1a3 3 0 0 1-4.2-4.2"/><path d="m3 3 18 18"/>', s),
  pencil: s => svg('<path d="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>', s),
  tag:    s => svg('<path d="M20.6 13.4 12 22l-9-9V4a1 1 0 0 1 1-1h9l7.6 7.6a2 2 0 0 1 0 2.8Z"/><circle cx="7.5" cy="7.5" r="1.5"/>', s),
  ledger: s => svg('<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H5.5A1.5 1.5 0 0 1 4 19.5Z"/><path d="M4 17.5h16"/><path d="M8 7h8M8 11h5"/>', s),

  /* Wortmarke von warframe.market.

     BREITER ALS HOCH, deshalb kein svg()-Aufruf: dessen Kasten ist quadratisch,
     und ein Schriftzug im Quadrat wird entweder gestaucht oder winzig. `s` ist
     hier die HOEHE, die Breite folgt dem Seitenverhaeltnis.

     Der mittlere Zug traegt das Rot der Seite, die beiden aeusseren nehmen die
     Textfarbe an - so sitzt die Marke in einer hellen Ueberschrift genauso
     richtig wie in einer gedaempften Zeile. */
  wfm: (s = 14) => `<svg viewBox="0 0 1952 735" height="${s}" width="${(s * 1952 / 735).toFixed(1)}"
       class="wfm-logo" role="img" aria-label="warframe.market">
    <path fill="currentColor" d="m1436.62 603.304 56.39-142.599h162.82l-77.27-216.315L1675.2 0 1952 734.934h-204.13l-47.3-131.629h-263.95z"/>
    <path fill="var(--wfm-red)" d="M1262.47 734.935 1558.79.002h-196.45l-202.7 474.931L1015.5.003H864.499l-154.768 474.93-109.146-216.416-98.773 304.302 100.284 172.116h193.331l139.857-425.91 133.346 425.91h193.84z"/>
    <path fill="currentColor" d="M186.476 482.643h121.003c36.654 0 69.293-4.091 97.917-12.273l31.293-96.408 87.459-269.446c-6.664-10.563-14.272-20.55-22.824-29.96C456.419 24.853 390.719 0 304.222 0H0v734.933h186.476v-252.29zm160.166-313.564c17.54 17.653 26.309 41.276 26.309 70.871 0 29.822-7.713 53.474-23.138 70.956-16.91 19.425-48.047 29.137-93.409 29.137h-69.928V142.598h70.442c42.277 0 72.185 8.827 89.724 26.481z"/>
  </svg>`
};


const FOCUS_SCHOOLS = ['madurai', 'vazarin', 'naramon', 'unairu', 'zenurik'];

/* ------------------------------------------------------------------
   Polaritaeten

   Die Zeichen, die im Spiel oben rechts auf jeder Mod stehen. Bisher stand
   dort ein Buchstabe als Notbehelf (V fuer Madurai) - das sind die echten
   Glyphen, als Vektor aus dem Warframe-Wiki uebernommen.

   ALS PFAD UND NICHT ALS BILD, aus zwei Gruenden: sie faerben sich ueber
   currentColor mit (auf der Karte gruen, in den Werten gedaempft), und sie
   bleiben scharf, ob sie nun 11 oder 24 Pixel gross gezeichnet werden.
   ------------------------------------------------------------------ */

const POL_GLYPHS = {
  madurai: { box: "0 0 50 50", d: "<path fill-rule=\"evenodd\" d=\"m 10.59322,45.127118 0.635593,-29.449152 c 0,0 -2.3305077,-2.542373 -5.5084737,-4.025424 C 13.559322,8.2627119 19.915254,4.8728813 19.915254,4.8728813 l 0.211865,18.6440677 c 8.68644,-6.991526 16.313559,-13.9830507 16.313559,-13.9830507 5.932204,-1.2711865 9.322034,5.2966097 9.322034,5.2966097 0,0 -26.483051,7.415255 -35.169492,30.29661 z\"/>" },
  vazarin: { box: "0 0 50 50", d: "<path fill-rule=\"evenodd\" d=\"m 36.652538,6.3559322 c 0,0 -13.559317,0 -31.355928,0.8474576 C 33.262712,25.211865 35.381356,44.279661 35.381356,44.279661 50.211868,27.330509 37.711868,4.0254237 37.711868,4.0254237 Z\"/><path fill-rule=\"evenodd\" d=\"m 38.135598,16.949153 -12.500004,0.847458 9.745763,11.440678 c 0,0 4.237291,-5.29661 2.754241,-12.288136 z\"/><path fill-rule=\"nonzero\" d=\"M 37.640856,5.1003873 C 36.765017,5.2841879 37.028695,6.7637876 35.901504,6.308675 26.719831,6.602264 17.523026,6.6025768 8.3526715,7.15241 7.5312902,7.0176536 6.7787941,7.9655835 7.6243876,8.5229078 11.40461,11.59298 15.425424,14.356797 18.925202,17.760941 c 7.318042,6.861254 13.4384,15.241864 16.215076,24.977241 0.705891,1.031852 1.741461,-0.291445 2.158368,-0.93601 C 41.62747,35.649636 43.195017,27.881506 42.40768,20.465226 41.853131,15.267761 40.540519,10.085642 38.225966,5.3904595 38.100324,5.1997821 37.878597,5.0560634 37.640856,5.1003873 Z m 0.525938,11.8751657 c 0.841342,4.226753 -0.293565,8.723053 -2.760444,12.237653 -3.277079,-3.736753 -6.494106,-7.526665 -9.656797,-11.35585 4.074873,-0.432813 8.315945,-0.644555 12.417241,-0.881803 z\"/><path fill-rule=\"nonzero\" d=\"M 7.0101176,7.2193778 C 6.5475877,7.255502 6.3929253,7.8639901 6.7369076,8.1492846 7.0042471,8.5658337 7.745735,8.3471082 7.6887024,7.8401981 7.6791581,7.5065169 7.3290564,7.2277311 7.0101176,7.2193778 Z\"/>" },
  naramon: { box: "0 0 50 50", d: "<path fill-rule=\"evenodd\" d=\"m 10.242086,35.426443 c 0,0 -2.7932962,-7.44879 -6.8901312,-15.642458 l 20.6703922,-0.558659 15.828677,-0.18622 0.744879,-5.027933 3.165736,7.63501 3.351955,6.89013 -22.346368,0.186219 -12.849162,-0.186219 z\"/>" },
  zenurik: { box: "0 0 50 50", d: "<g transform=\"translate(2.9033123,12.232624)\"><path fill-rule=\"evenodd\" d=\"M -0.29103557,0.1444304 C 1.5711614,5.451692 6.9715343,9.8278559 6.9715343,9.8278559 12.092577,3.8688249 30.621441,6.7552299 30.621441,6.7552299 c 0,0 -6.517691,-8.7523273 -30.91247657,-6.6107995 z\"/></g><g transform=\"translate(2.9033123,12.232624)\"><path fill-rule=\"evenodd\" d=\"m 11.440807,14.297129 c 1.955307,4.841713 7.91434,9.869646 7.91434,9.869646 8.752327,-6.517691 24.487895,-2.048417 24.487895,-2.048417 0,0 -9.217877,-10.800743 -32.402235,-7.821229 z\"/></g>" },
  unairu: { box: "0 0 50 50", d: "<path fill-rule=\"evenodd\" d=\"m 45.24285,24.981603 c -23.070858,-2.696593 -31.010828,0.299621 -31.010828,0.299621 -3.895079,1.947541 -1.94754,13.632779 -1.94754,13.632779 0.125247,4.420632 -3.3480364,1.041886 -3.5954584,0.299622 C 0.14981062,22.43482 12.883725,12.54731 12.883725,12.54731 18.276914,7.3039335 31.759881,7.0043121 31.759881,7.0043121 c 1.198486,2.3969718 -1.498107,4.9437549 -1.498107,4.9437549 -9.438078,4.044891 -5.393187,6.741484 -5.393187,6.741484 16.179561,3.295838 20.374263,6.292052 20.374263,6.292052 z\"/>" },
  penjaga: { box: "0 0 50 50", d: "<path fill-rule=\"evenodd\" d=\"m 30.528858,39.849889 c 0,0 -7.44879,2.793296 -15.642457,6.890131 L 14.327742,26.069628 14.141522,10.240951 9.1135894,9.4960727 l 7.6350086,-3.165736 6.89013,-3.351955 0.186219,22.3463673 -0.186219,12.849162 z\"/><path fill-rule=\"evenodd\" d=\"m 30.167597,31.564245 0,-0.558659 0.18622,-10.893855 11.080074,-4.748603 0.27933,11.824953 z\"/>" },
  umbra: { box: "0 0 52 52", d: "<path d=\"M47.9,1.2c-5.2,1.9-9.3,6.9-9.3,6.9l0,0c2.1,2.2,3.4,5,3.4,8c0,5.9-4.9,10.9-11.5,12.5c0,0,0,0,0,0l0,0\r\n\tC27.6,26.1,27.9,18,27.9,18c0-1.5-0.7-3.1-1.9-3.1s-1.9,1.6-1.9,3.1c0,0,0.3,8.2-2.6,10.7C14.9,27,10,22.1,10,16.1\r\n\tc0-3,1.3-5.8,3.4-8c0,0-4.5-5.2-9.4-7C8.6,5.5,7.4,10,6.9,12s-1.7,5-1.3,8.2c0,0,0,0,0-0.1c0,0,0,0,0,0.1c0,7.2,5.7,13.4,13.7,15.6\r\n\tc0,0.7,0,1.5,0,2.4c0,2.1,0.9,3.7,2.2,4.7v3.3c0,2.5,2,4.6,4.4,4.6s4.4-2.1,4.4-4.6v-3.3c1.4-1,2.2-2.6,2.2-4.7c0-0.9,0-1.7,0-2.4\r\n\tc8-2.2,13.7-8.4,13.7-15.6c0.4-3.2-0.8-6.3-1.3-8.2S43.4,5.5,47.9,1.2z M28.4,45.2c0,1.6-1.1,3-2.4,3s-2.4-1.3-2.4-3v-5.9\r\n\tc0-1.6,1.1-3,2.4-3s2.4,1.3,2.4,3V45.2z\"/>" },
  koneksi: { box: "0 0 37.5 37.5", d: "<path fill-rule=\"evenodd\" d=\"m 10.959482,2.0176159 -0.1875,0.296875 c 0,0 -0.268176,0.4350796 -0.660156,1.1542969 C 9.7711843,4.0057109 9.5311153,4.6469658 9.1801852,5.1387096 9.1674694,5.2056617 9.177984,5.25396 9.1782321,5.3105846 9.1476452,5.375051 9.1213455,5.422058 9.0903414,5.488319 8.3396501,5.4689705 8.4188217,5.4653239 7.7485445,5.4453503 6.3742736,5.3255247 4.9687858,5.3431807 3.6001071,5.2988659 3.487446,5.2740251 3.3893929,5.2812759 3.2993258,5.3027722 3.1842464,5.298314 2.3344821,5.2715222 2.3344821,5.2715222 L 1.6547945,5.238319 2.1508883,5.7031628 c 1.561066,1.4657335 3.3931763,2.649014 5.3535156,3.6152344 -0.00417,0.00385 -0.00749,0.00794 -0.011719,0.011719 C 5.6462337,14.566867 4.9034776,20.391429 6.0942477,25.843787 c 0.00419,0.01955 0.00748,0.03904 0.011719,0.05859 0.1145749,0.518323 0.2440902,1.034247 0.3945313,1.544922 0.081304,0.282642 0.1804301,0.564825 0.2734375,0.847656 0.046031,0.136081 0.087965,0.27282 0.1367187,0.408203 0.5021668,1.437571 1.1601409,2.872575 2.0039063,4.291016 0.08545,0.14421 0.1754423,0.284833 0.265625,0.425781 0.1813428,0.291135 0.3493771,0.583754 0.546875,0.873047 l 0.1464843,0.214844 0.2089845,-0.154297 c 0.102696,-0.07567 0.127056,-0.09637 0.226562,-0.169922 0.525022,-0.194308 0.954764,-0.797135 1.447266,-1.048828 0.391425,-0.371748 0.897144,-0.662169 1.30664,-1.027344 0.265058,-0.202718 0.763169,-0.570881 0.972657,-0.732422 l 1.300781,0.02149 c 0.763809,0.179114 1.643028,0.02363 2.40625,0.117187 2.142795,-0.04899 4.233095,0.153383 6.355469,0.207032 0.738762,0.04369 0.840049,0.05069 1.607422,0.0957 0.08967,0.153384 0.181156,0.295764 0.271484,0.447265 0.04802,0.157434 0.132052,0.308183 0.251953,0.419922 0.05996,0.08475 0.111796,0.181788 0.167969,0.271484 0.113536,0.183537 0.226467,0.368216 0.339844,0.544922 0.07685,0.126492 0.162041,0.243344 0.246093,0.363282 0.210437,0.317889 0.421255,0.645282 0.626953,0.925781 l 0.189454,0.257812 0.203124,-0.246093 c 0.565534,-0.678641 1.062183,-1.366136 1.527344,-2.056641 0.01468,-0.02338 0.02923,-0.04028 0.04297,-0.06445 0.138666,-0.207253 0.289781,-0.4131 0.419922,-0.621094 0.107186,0.0059 0.20508,0.01153 0.314453,0.01758 0.03743,0.0064 0.06837,0.0187 0.111328,0.01953 1.299007,0.04554 2.626851,0.242233 3.921875,0.185546 0.05571,0.0023 0.15124,0.0078 0.203125,0.0098 0.237703,0.0091 0.433927,0.01667 0.583984,0.01953 0.150059,0.0029 0.241467,0.004 0.320313,-0.0039 l 0.455078,-0.04492 -0.283203,-0.359375 c 0,0 -0.454273,-0.522227 -1.34375,-1.259766 -0.04509,-0.04254 -0.107675,-0.08773 -0.142578,-0.128906 -0.707852,-0.520597 -1.421767,-1.247942 -2.263672,-1.560547 -0.07073,-0.04218 -0.130157,-0.08254 -0.203125,-0.125 0.07767,-0.183124 0.146652,-0.367608 0.21875,-0.550781 0,0 0,-0.002 0,-0.002 0.283273,-0.72002 0.50891,-1.438474 0.710937,-2.15625 0.06314,-0.221052 0.119598,-0.443627 0.175782,-0.666016 0.100295,-0.40243 0.194167,-0.803043 0.271484,-1.203125 0.07526,-0.384199 0.143321,-0.769334 0.199219,-1.15625 0.0343,-0.241369 0.06314,-0.480755 0.08984,-0.720703 0.04651,-0.408757 0.08136,-0.817938 0.107421,-1.228515 0.0087,-0.142332 0.0231,-0.286088 0.0293,-0.427735 0.02714,-0.58408 0.03166,-1.168543 0.01953,-1.753906 -0.0014,-0.06017 -0.004,-0.11969 -0.0059,-0.179687 -0.11481,-4.188208 -1.200144,-8.375522 -2.929687,-12.1621095 -0.02265,-0.040104 -0.0547,-0.083895 -0.07813,-0.1269531 -0.981141,-2.16448 -1.826172,-3.484375 -1.826172,-3.484375 l -0.453125,0.1875 c 0.142391,0.6830645 0.268849,1.3409894 0.384766,1.9824219 -0.04804,0.00422 -0.104034,0.00562 -0.152344,0.00977 -0.03402,-0.00102 -0.06778,-0.00637 -0.101563,-0.00391 -4.851407,0.3817323 -9.711189,0.2695252 -14.578125,0.3691407 -0.01779,0.00731 -0.02456,0.017682 -0.04102,0.025391 -0.07191,-7.66e-4 -0.149071,8.166e-4 -0.220703,0 C 13.408316,5.4573054 13.322586,5.335902 13.242685,5.2129284 13.148184,4.8480856 12.841028,4.5177411 12.56495,4.1953503 12.114502,3.5378971 11.653201,2.892372 11.178232,2.2930065 l -0.21875,-0.2753906 z m 5.183594,10.1855461 c 0.0072,0.0013 0.01432,0.0027 0.02148,0.0039 0.0047,-7.79e-4 0.0071,-0.0031 0.01172,-0.0039 0.371863,0.07918 0.739212,0.148899 1.107421,0.220703 0.827185,0.294168 1.795328,0.255574 2.638672,0.462891 2.53731,0.390381 5.116621,0.579355 7.681641,0.582031 0.768148,0.01159 1.421601,0.01061 1.833984,0.002 4.63e-4,0.07881 -0.0038,0.146848 -0.0039,0.224609 -0.203216,0.762642 -0.04796,1.663758 -0.214844,2.414062 -0.318289,2.883811 -0.948559,6.230376 -3.460937,8.0625 -0.4662,0.425386 -1.180711,0.544581 -1.703125,0.875 -0.812703,0.236446 -1.392578,0.197266 -1.392578,0.197266 l -0.429688,-0.03125 0.05469,0.115234 c -0.01747,-0.0039 -0.03718,-0.0078 -0.05469,-0.01172 -1.106397,-0.331961 -2.319182,-0.423686 -3.457031,-0.63086 -0.112487,-0.01428 -0.225359,-0.02848 -0.337891,-0.04297 -0.488219,-0.06858 -0.99084,-0.129882 -1.503906,-0.1875 -1.374134,-0.172313 -2.751495,-0.328679 -4.134765,-0.359374 -0.103315,-0.0105 -0.192734,-0.0028 -0.271485,0.01758 -0.0357,-0.0015 -0.06772,-0.0045 -0.103515,-0.0059 -0.02284,-0.09073 -0.03365,-0.174103 -0.05469,-0.263672 0.01152,-0.406631 -0.122087,-0.882842 -0.173828,-1.21875 -0.264106,-2.419384 -0.205042,-5.049977 1.11914,-7.183593 0.597507,-1.146526 1.42209,-2.086045 2.384766,-2.898438 0.154485,-0.120934 0.316088,-0.251915 0.44336,-0.339844 z m 7.435546,13.433594 c 7.4e-5,0.0013 -8e-5,0.0026 0,0.0039 -0.0033,-8.63e-4 -0.0064,-0.0011 -0.0098,-0.002 0.0027,-3.23e-4 0.007,-0.0016 0.0098,-0.002 z\"/>" },
  any: { box: "0 0 52 52", d: "<path d=\"M33.9,14.8c5.4,6.2,2.6,29.5-24.8,36C35.8,55,49.6,36.6,47.4,22.2C45.7,18.4,37.9,14.8,33.9,14.8z\"/><path d=\"M18.2,37.3c-5.4-6.2-2.6-29.5,24.8-36C16.3-2.9,2.5,15.5,4.7,29.9C6.4,33.7,14.2,37.3,18.2,37.3z\"/>" },
  exilus: { box: "0 0 64 64", d: "<path d=\"M13.1,26.8c0.3-1.9,3.2-4.6,6.8-7.7V13h-4.2c0.1-1-0.4-1.8-0.7-2.5h-2.5L7,16.1v3.8L9,20v2.1c-1.1,1.5-2.4,2.7-3.5,3.9H1.9\r\n\t\tv7.5c8,2.9,8.7,8.6,4.4,9.8l4.6,5.7h3.4l1.8-1.3l6.2,5.5v-9.8c0,0-9.2-7.5-9.3-8.9C12.9,33.1,12.8,28.8,13.1,26.8z\"/><path d=\"M50.9,26.8c-0.3-1.9-3.2-4.6-6.8-7.7V13h4.2c-0.1-1,0.4-1.8,0.7-2.5h2.5l5.6,5.6v3.8L55,20v2.1c1.1,1.5,2.4,2.7,3.5,3.9\r\n\t\th3.7v7.5c-8,2.9-8.7,8.6-4.4,9.8L53.1,49h-3.4l-1.8-1.3l-6.2,5.5v-9.8c0,0,9.2-7.5,9.3-8.9C51.1,33.1,51.2,28.8,50.9,26.8z\"/><path d=\"M40.8,36.9l-8-7.9c-0.2-0.2-0.5-0.4-0.9-0.4c-0.3,0-0.6,0.1-0.9,0.4l-8,7.9c0,0-1.1,4.2,0.4,5.6c1.1,1.1,1.6,1.6,1.6,1.6\r\n\t\t\tl6.9-6.9l6.9,6.9c0,0,0.5-0.5,1.6-1.6C41.9,41.1,40.8,36.9,40.8,36.9z\"/><path d=\"M40.8,23.4l-8-7.9c-0.2-0.2-0.5-0.4-0.9-0.4c-0.3,0-0.6,0.1-0.9,0.4l-8,7.9c0,0-1.1,4.2,0.4,5.6c1.1,1.1,1.6,1.6,1.6,1.6\r\n\t\t\tl6.9-6.9l6.9,6.9c0,0,0.5-0.5,1.6-1.6C41.9,27.6,40.8,23.4,40.8,23.4z\"/>" }
};

/**
 * Polaritaets-Glyphe. `key` ist der Kurzname aus mods.js (madurai, vazarin, …).
 * Unbekanntes ergibt nichts - lieber eine Luecke als ein falsches Zeichen.
 */
Icon.polarity = (key, size = 12) => {
  const g = POL_GLYPHS[key];
  if (!g) return '';
  return `<svg viewBox="${g.box}" width="${size}" height="${size}" fill="currentColor"
               class="pol-glyph" aria-hidden="true">${g.d}</svg>`;
};
