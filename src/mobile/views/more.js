/* "More": die Verbindung zum PC, Push-Meldungen und was die App ist.
 *
 * Hier laeuft das Koppeln, und auf dem iPhone hat es einen Schritt mehr als
 * anderswo: Push gibt es dort nur fuer Apps auf dem Home-Bildschirm, und die
 * haben einen EIGENEN Speicher - was Safari sich gemerkt hat, kennt die
 * installierte App nicht. Der Kopplungscode wandert deshalb einmal ueber die
 * Zwischenablage, falls iOS ihn nicht von selbst mitnimmt. */

import { esc, Icon, ago, clockTime } from '../lib/ui.js';

const TYPES = [
  ['fissure', 'Void fissures', 'New fissures that match your filter on the PC'],
  ['cycle', 'Open-world cycles', 'Shortly before a cycle you picked on the PC changes'],
  ['foundry', 'Foundry', 'When something finishes building, or the Helminth is done'],
  ['whisper', 'Whispers', 'When someone whispers you in game']
];

function kopplungFehlt(env) {
  const ios = env.push.ios;
  return `<div class="card">
    <h3>Connect to Argus on your PC</h3>
    <p class="sub" style="margin:4px 0 12px">The live tracker and drop tables work right away. Pair this phone with your PC for
      notifications, and for your foundry, goals, inventory and prices when you are home.</p>
    <ol class="steps">
      <li>On your PC, open <b>Argus → Settings → Phone</b> and choose <b>Pair a phone</b>.</li>
      <li>Scan the code with your phone's camera.</li>
      ${ios && env.push.standalone ? '<li>Opened Safari instead of this app? Tap <b>Copy pairing code</b> there, come back here and paste it.</li>' : ''}
    </ol>
    ${env.push.standalone || env.push.android ? `<button class="btn primary block" data-act="paste-code">Paste pairing code</button>
      <textarea id="code-input" class="hidden" rows="3" placeholder="Paste the pairing code here"
        style="width:100%;margin-top:10px;border-radius:10px;border:0;padding:10px;background:var(--surface-2);color:var(--text);font:inherit;font-size:16px"></textarea>` : ''}
  </div>`;
}

function installieren(env) {
  return `<div class="card">
    <h3>Add Argus to your home screen</h3>
    <p class="sub" style="margin:4px 0 12px">On iPhone and iPad, notifications only reach apps on the home screen (iOS 16.4 or newer).</p>
    <ol class="steps">
      <li class="${env.copied ? 'done' : ''}">Tap <b>Copy pairing code</b> below.</li>
      <li>Tap ${Icon.share(17)} <b>Share</b> in Safari, then <b>Add to Home Screen</b>.</li>
      <li>Open <b>Argus</b> from your home screen. If it asks, tap <b>Paste pairing code</b>.</li>
    </ol>
    <button class="btn primary block" data-act="copy-code">${env.copied ? 'Copied — now add to home screen' : 'Copy pairing code'}</button>
    <p class="muted small" style="margin:10px 2px 0">You can also keep using Argus here in Safari — just without notifications.</p>
  </div>`;
}

function meldungen(env) {
  const p = env.push;
  const pc = env.pc;
  if (!p.supported) {
    return `<div class="note warn">${p.ios ? 'Notifications need iOS 16.4 or newer.' : 'This browser cannot receive notifications from Argus.'}</div>`;
  }
  if (p.permission === 'denied') {
    return `<div class="note warn">Notifications are blocked for Argus. ${p.ios
      ? 'Allow them in <b>Settings → Notifications → Argus</b>, then come back.'
      : 'Allow them in the site settings of your browser, then come back.'}</div>`;
  }
  const bestaetigt = env.confirmedAt;
  if (bestaetigt && env.subscribed) {
    return `<div class="note ok">${Icon.check(16)} Notifications are on — the last one arrived ${esc(ago(bestaetigt))}.</div>
      <button class="btn small" data-act="push-on">Reconnect notifications</button>`;
  }
  if (env.subscribed && env.registerUrl) {
    return `<ol class="steps">
        <li class="done">Notifications allowed.</li>
        <li>Tap <b>Connect to ${esc(pc.name)}</b>. It opens a page from your PC — you need to be in the same Wi-Fi. Then come back here.</li>
      </ol>
      <a class="btn primary block" href="${esc(env.registerUrl)}" target="_blank" rel="noopener" data-act="register-open">${Icon.pc(18)} Connect to ${esc(pc.name)}</a>
      <p class="muted small" style="margin:10px 2px 0">Nothing happens? Windows may have asked on the PC whether Argus may use the network — allow it there.</p>`;
  }
  return `<p class="sub" style="margin:0 0 12px">Get fissures, open-world cycles, a finished foundry and whispers on this phone — even when Argus is closed here.</p>
    <button class="btn primary block" data-act="push-on">${Icon.bell(18)} Turn on notifications</button>`;
}

function arten(types, editable) {
  return `<div class="list">${TYPES.map(([k, label, text]) => `<div class="row noicon${editable ? ' tap' : ''}"${editable ? ` data-act="type-toggle" data-val="${k}"` : ''}>
    <div class="main"><div class="title">${esc(label)}</div><div class="meta wrap">${esc(text)}</div></div>
    <div class="end">${types?.[k] !== false ? '<span class="badge ok">On</span>' : '<span class="badge">Off</span>'}</div>
  </div>`).join('')}</div>`;
}

function eingang(inbox) {
  if (!inbox?.length) return '';
  return `<section class="section"><div class="section-title">Recent notifications</div>
    <div class="list">${inbox.slice(0, 15).map(n => `<div class="row noicon"><div class="main">
      <div class="title">${esc(n.title)}</div><div class="meta wrap">${esc(n.body)}</div></div>
      <div class="end muted small">${esc(clockTime(n.ts))}</div></div>`).join('')}</div></section>`;
}

function ueber(env) {
  return `<section class="section"><div class="section-title">About</div>
    <div class="card small">
      <p style="margin:0 0 8px">Argus is a companion for Warframe — free, open source, not affiliated with Digital Extremes.</p>
      <p class="muted" style="margin:0 0 8px">${env.mode === 'pc'
        ? 'This page comes from Argus on your PC. Everything you see here stays in your own network.'
        : 'On the go, this app asks the public sources itself: warframestat.us for the world state and drop tables, warframe.market for prices. Your inventory never leaves your PC.'}</p>
      <p class="muted" style="margin:0">Notifications travel through your phone's own push service (Apple or Google), end-to-end encrypted — they can see that something arrived, not what.</p>
    </div>
    <p class="muted small" style="text-align:center"><a href="https://github.com/Kr3akz/Argus" target="_blank" rel="noopener">github.com/Kr3akz/Argus</a></p>
  </section>`;
}

/**
 * @param env {
 *   mode, pc (Kopplung oder null), push (pairing.pushSupport()),
 *   subscribed, registerUrl, confirmedAt, copied, inbox,
 *   hello (zuhause: Antwort von /api/hello), types
 * }
 */
export function render(env) {
  if (env.mode === 'pc') {
    const h = env.hello;
    return `<section class="section"><div class="section-title">This PC</div>
        <div class="card"><h3>${esc(h?.pc?.name || 'Argus')}</h3>
          <div class="sub">Argus ${esc(h?.pc?.version || '')} · paired as ${esc(h?.device?.name || 'this phone')}</div></div>
      </section>
      <section class="section"><div class="section-title">Notifications on this phone</div>
        ${arten(env.types || h?.device?.types, true)}
        <p class="muted small" style="margin:0 2px">Tap to switch. Which fissures and cycles count is set on the PC.
          ${h?.device?.push ? '' : `<br>Notifications themselves are turned on in the Argus app on your home screen — <a href="${esc(h?.appUrl || '#')}" target="_blank" rel="noopener">open it</a>.`}</p>
      </section>
      ${ueber(env)}`;
  }

  const pc = env.pc;
  let oben;
  if (!pc) {
    oben = kopplungFehlt(env);
  } else {
    oben = `<section class="section"><div class="section-title">Your PC</div>
      <div class="card">
        <div style="display:flex;gap:12px;align-items:center">
          <span class="glyph">${Icon.pc(20)}</span>
          <div style="flex:1;min-width:0"><h3>${esc(pc.name)}</h3><div class="sub">${esc(pc.url.replace(/^http:\/\//, ''))} · paired ${esc(ago(pc.pairedAt))}</div></div>
        </div>
        <div class="btn-row">
          <a class="btn" href="${esc(env.pcViewUrl)}" target="_blank" rel="noopener">${Icon.pc(18)} Open my PC</a>
          <button class="btn danger" data-act="unpair">Unpair</button>
        </div>
        <p class="muted small" style="margin:10px 2px 0">"Open my PC" shows your foundry, goals, inventory and prices — in the same Wi-Fi as your PC, while Argus runs there.</p>
      </div>
    </section>
    <section class="section"><div class="section-title">Notifications</div>
      ${env.push.needsInstall ? installieren(env) : `<div class="card">${meldungen(env)}</div>`}
    </section>
    ${eingang(env.inbox)}`;
  }
  return oben + ueber(env);
}
