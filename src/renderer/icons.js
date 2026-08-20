/* Inline-SVG-Icons für Cephalon Argus
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
  warning:  s => svg('<path d="M12 3 2 20h20L12 3Z"/><path d="M12 9v5M12 17.5v.5"/>', s),
  globe:    s => svg('<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20"/>', s),
  compass:  s => svg('<circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>', s),
  sun:      s => svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>', s),
  moon:     s => svg('<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>', s),
  snowflake:s => svg('<path d="M2 12h20M12 2v20M20 16l-4-4 4-4M4 8l4 4-4 4M16 4l-4 4-4-4M8 20l4-4 4 4"/>', s),
  flame:    s => svg('<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5Z"/>', s),

  /* Offizielle Warframe / Tenno In-Game Symbole */
  /* Alert-Dreieck der Sternenkarte. Gefuellte Flaeche - das Ausrufezeichen
     ist per evenodd ausgespart, nicht aufgemalt, damit es bei 22px klar bleibt. */
  alert: s => svgFilled('<path fill-rule="evenodd" clip-rule="evenodd" d="M13.06 3.02a1.22 1.22 0 0 0-2.12 0L1.29 20.06A1.22 1.22 0 0 0 2.35 21.9h19.3a1.22 1.22 0 0 0 1.06-1.84L13.06 3.02ZM12 8.3a1.2 1.2 0 0 0-1.2 1.2v4.9a1.2 1.2 0 0 0 2.4 0V9.5A1.2 1.2 0 0 0 12 8.3Zm0 8.05a1.35 1.35 0 1 0 0 2.7 1.35 1.35 0 0 0 0-2.7Z"/>', s),

  lotus: s => svg('<path d="M12 2.5C11.5 5.2 9.8 7.5 7.2 9c2.5.2 4.8 2 4.8 4.5 0-2.5 2.3-4.3 4.8-4.5-2.6-1.5-4.3-3.8-4.8-6.5Z"/><path d="M12 13.5v7.5"/><path d="M7 11.2C4.5 11.8 2.5 13.5 2 16c2.5 0 4.5-1 5.8-3Z"/><path d="M17 11.2c2.5.6 4.5 2.3 5 4.8-2.5 0-4.5-1-5.8-3Z"/><path d="M9 16c-2 1.2-3.5 3.2-4 5.5 2.5-.5 4.5-2 5-4.5Z"/><path d="M15 16c2 1.2 3.5 3.2 4 5.5-2.5-.5-4.5-2-5-4.5Z"/>', s),
  
  ducat: s => svg('<path d="m12 2 8 4.5v11L12 22l-8-4.5v-11L12 2Z"/><path d="m12 6.5 4.5 2.5v6L12 17.5 7.5 15V9L12 6.5Z"/><path d="M12 9.5v5M9.5 12h5"/>', s),
  
  relic: s => svg('<path d="m12 2 6 4-2 7 4 5-8 4-8-4 4-5-2-7 6-4Z"/><path d="M12 6v12M7.5 9.5l4.5 3 4.5-3"/>', s),
  
  mastery: s => svg('<path d="m12 2 9 4.5v8c0 4.5-4 8-9 8.5-5-.5-9-4-9-8.5v-8L12 2Z"/><path d="m8.5 9.5 3.5 3.5 3.5-3.5M8.5 13.5 12 17l3.5-3.5"/>', s),
  
  forma: s => svg('<path d="M12 2v20M2 12h20M4.93 4.93l14.14 14.14M19.07 4.93 4.93 19.07"/><circle cx="12" cy="12" r="3.5"/>', s),
  
  starchart: s => svg('<circle cx="12" cy="12" r="3"/><circle cx="19" cy="6" r="2"/><circle cx="5" cy="18" r="2"/><circle cx="19" cy="18" r="2"/><circle cx="5" cy="6" r="2"/><path d="M12 9V8M12 16v-1M9 12H8M16 12h-1M10 10 7 7M14 14l3 3M14 10l3-3M10 14l-3 3"/>', s),
  
  codex: s => svg('<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M7 7h9M7 11h9M7 15h5"/><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>', s),
  
  bell: s => svg('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>', s),
  
  bellRing: s => svg('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/><path d="M4 2C2.8 3.7 2 5.7 2 8"/><path d="M22 8c0-2.3-.8-4.3-2-6"/>', s),
  
  volume: s => svg('<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>', s),
  
  sliders: s => svg('<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>', s),
  
  /* Wortmarke: das Auge des Argus. Die Strahlen stehen fuer die hundert Augen,
     von denen nie alle zugleich schlafen - das Sinnbild fuer den Waechter, der
     im Hintergrund den Weltzustand beobachtet. */
  argus: s => svg('<path d="M12 5.5c5 0 8.4 4 9.3 6.1a1 1 0 0 1 0 .8c-.9 2.1-4.3 6.1-9.3 6.1s-8.4-4-9.3-6.1a1 1 0 0 1 0-.8C3.6 9.5 7 5.5 12 5.5Z"/><circle cx="12" cy="12" r="3.2"/><path d="M12 1.8v1.8M12 20.4v1.8M3.9 4.6l1.3 1.3M18.8 18.1l1.3 1.3M20.1 4.6l-1.3 1.3M5.2 18.1l-1.3 1.3"/>', s)
};

