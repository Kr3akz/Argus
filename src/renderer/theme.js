/**
 * Legt das gewaehlte Theme auf <html> - in jedem Fenster, als erstes Skript im
 * <head>.
 *
 * WARUM IM HEAD UND SYNCHRON:
 *   Stuende das Skript am Ende der Seite oder wartete es auf eine asynchrone
 *   Antwort, zeichnete Chromium den ersten Augenblick mit den Werten aus
 *   style.css - also im Standard-Theme - und spraenge dann um. Hier ist
 *   window.api schon da (preload.cjs laeuft vorher), und getThemeSync()
 *   antwortet aus dem Speicher des Hauptprozesses.
 *
 * WAS HIER NICHT PASSIERT:
 *   Gerechnet wird nichts. Das Theme kommt als fertige Liste von CSS-Variablen
 *   (core/themes.js, resolveTheme); ohne Antwort bleibt es bei den Werten aus
 *   :root in style.css, und die sind das Standard-Theme.
 *
 * Eigene Datei und globales `ArgusTheme` wie icons.js und stock.js: fuenf
 * Fenster brauchen dasselbe, und nur eines davon laedt app.js.
 */
const ArgusTheme = (() => {
  const root = document.documentElement;
  let applied = {};
  let current = null;
  const listeners = new Set();

  function apply(theme) {
    if (!theme || !theme.vars) return;
    for (const [k, v] of Object.entries(theme.vars)) root.style.setProperty(k, v);
    /* Was das vorige Theme gesetzt hat und das neue nicht mehr, faellt auf
       style.css zurueck - sonst bliebe ein alter Wert haengen. */
    for (const k of Object.keys(applied)) if (!(k in theme.vars)) root.style.removeProperty(k);
    applied = { ...theme.vars };
    current = theme;
    root.dataset.theme = theme.id || '';
    for (const cb of listeners) { try { cb(theme); } catch { /* ein Lauscher darf die anderen nicht aufhalten */ } }
  }

  try { apply(window.api?.getThemeSync?.()); } catch { /* ohne Antwort gilt style.css */ }
  try { window.api?.onThemeChanged?.(apply); } catch { /* kein Kanal, kein Wechsel */ }

  return {
    apply,
    current: () => current,
    /* Fuer Ansichten, die vom Wechsel selbst erfahren muessen - etwa die
       Auswahl in den Einstellungen. Farben muss hier niemand nachziehen:
       alles liest die Variablen direkt. */
    onChange: cb => { listeners.add(cb); return () => listeners.delete(cb); }
  };
})();
