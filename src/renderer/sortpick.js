/**
 * Sortierung aus MEHREREN Kriterien - an der Stelle, an der ein Auswahlfeld stand.
 *
 * WARUM EIN AUSWAHLFELD HIER NICHT REICHT:
 *   Ein <select> kennt eine Antwort. Die Fragen, die man an diese Listen hat,
 *   bestehen aber aus zwei Haelften, und erst zusammen ergeben sie einen Sinn:
 *
 *     "von welchem Set habe ich nur EIN Teil - und welches davon ist das
 *      teuerste?"
 *
 *   Mit einem Auswahlfeld sind das zwei Durchgaenge: erst nach Teilen ordnen,
 *   dann die ersten zwanzig Karten von Hand nach dem Preis absuchen. Die zweite
 *   Haelfte der Frage beantwortet niemand - sie ist der Grund, aus dem man
 *   ueberhaupt geordnet hat.
 *
 * DIE REIHENFOLGE DER KLICKS IST DIE REIHENFOLGE DER KETTE. Wer erst "Teile"
 * und dann "Platin" waehlt, bekommt Gruppen gleicher Teilezahl, in jeder das
 * teuerste zuerst. Andersherum kommt eine ganz andere Liste heraus, und genau
 * darum steht die Nummer im Kaestchen: sie sagt, welche Frage zuerst gilt.
 *
 * DER ZUSTAND LIEGT HIER, NICHT IM DOM. Die Raster darunter werden bei jedem
 * Tastendruck in der Suche neu gezeichnet; haenge die Auswahl am Markup, waere
 * sie beim ersten Buchstaben weg. Aus demselben Grund wird das offene Feld
 * nicht neu gebaut - ein innerHTML unter dem Zeiger schlaegt es zu.
 */
const SortPick = (() => {
  /* Eine Instanz je Auswahlfeld, adressiert ueber die Kennung des Wirts. */
  const instances = new Map();
  let openId = null;

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** Was auf dem Knopf steht: die Kette, mit Pfeilen zwischen den Gliedern. */
  function chainLabel(inst) {
    if (!inst.value.length) return 'unsorted';
    return inst.value.map(k => inst.short.get(k) || k).join(' › ');
  }

  function optionRow(inst, key) {
    const at = inst.value.indexOf(key);
    const on = at >= 0;
    return `
      <button type="button" class="sortpick-opt ${on ? 'is-on' : ''}" data-key="${esc(key)}">
        <span class="sortpick-ord">${on ? at + 1 : ''}</span>
        <span class="sortpick-label">${esc(inst.labels.get(key) || key)}</span>
      </button>`;
  }

  /** Nur die Kaestchen und der Knopftext neu - das Feld selbst bleibt stehen. */
  function repaint(inst) {
    const btn = inst.root.querySelector('.sortpick-chain');
    if (btn) btn.textContent = chainLabel(inst);

    inst.root.querySelectorAll('.sortpick-opt').forEach(el => {
      const at = inst.value.indexOf(el.dataset.key);
      el.classList.toggle('is-on', at >= 0);
      const ord = el.querySelector('.sortpick-ord');
      if (ord) ord.textContent = at >= 0 ? String(at + 1) : '';
    });

    /* Der Zuruecksetzen-Knopf steht nur da, wenn es etwas zurueckzusetzen
       gibt - sonst ist er ein Knopf, der nichts tut. */
    const reset = inst.root.querySelector('.sortpick-reset');
    if (reset) {
      const off = inst.value.length === 1 && inst.value[0] === inst.fallback;
      reset.classList.toggle('hidden', off);
    }
  }

  function build(inst) {
    inst.host.innerHTML = `
      <label class="sortpick-caption" for="${esc(inst.id)}-btn">Sort:</label>
      <div class="sortpick" id="${esc(inst.id)}-pick">
        <button type="button" class="sortpick-btn" id="${esc(inst.id)}-btn"
                title="Order by several criteria — they apply in the order you pick them">
          <span class="sortpick-chain">${esc(chainLabel(inst))}</span>
          <span class="sortpick-caret">▾</span>
        </button>
        <div class="sortpick-panel hidden">
          <p class="sortpick-hint">Pick several — they apply in the order you click.</p>
          <div class="sortpick-opts">
            ${inst.keys.map(k => optionRow(inst, k)).join('')}
          </div>
          <button type="button" class="sortpick-reset hidden">Back to default</button>
        </div>
      </div>`;

    inst.root = inst.host.querySelector('.sortpick');
    inst.panel = inst.root.querySelector('.sortpick-panel');

    inst.root.querySelector('.sortpick-btn').onclick = () => toggle(inst);

    inst.root.querySelectorAll('.sortpick-opt').forEach(el => {
      el.onclick = () => pick(inst, el.dataset.key);
    });

    inst.root.querySelector('.sortpick-reset').onclick = () => {
      inst.value = [inst.fallback];
      repaint(inst);
      inst.onChange([...inst.value]);
    };

    repaint(inst);
  }

  /**
   * Ein Kriterium an- oder abwaehlen.
   *
   * ES BLEIBT IMMER EINES STEHEN. Eine leere Kette waere keine Sortierung,
   * sondern die Reihenfolge, in der die Daten zufaellig angekommen sind - und
   * die als Ergebnis eines Klicks auszugeben, waere eine Auskunft, die nichts
   * bedeutet. Der letzte Haken laesst sich deshalb nicht abwaehlen; wer die
   * Voreinstellung zurueck will, nimmt den Knopf darunter.
   *
   * EIN AUSSCHLIESSENDES KRITERIUM TRITT BEISEITE, statt die Kette zu
   * verschlucken. "Set progress" ordnet die Karten EINDEUTIG - keine zwei
   * stehen auf demselben Platz. Als erstes Glied einer Kette entscheidet es
   * damit jedes Paar allein, und alles dahinter kommt nie zum Zug: wer zur
   * Voreinstellung "Teile" und "Platin" dazuwaehlte, sah eine Liste, die sich
   * nicht ruehrte. Das ist kein Kriterium unter anderen, sondern DIE
   * Reihenfolge - es weicht deshalb, sobald ein zweites gewaehlt wird, und
   * raeumt umgekehrt die Kette ab, wenn man zu ihm zurueckkehrt.
   */
  function pick(inst, key) {
    const at = inst.value.indexOf(key);
    if (at >= 0) {
      if (inst.value.length === 1) return;
      inst.value.splice(at, 1);
    } else if (inst.exclusive.has(key)) {
      inst.value = [key];
    } else {
      inst.value = inst.value.filter(k => !inst.exclusive.has(k));
      inst.value.push(key);
    }
    repaint(inst);
    inst.onChange([...inst.value]);
  }

  function open(inst) {
    if (openId && openId !== inst.id) close(instances.get(openId));
    inst.panel.classList.remove('hidden');
    inst.root.classList.add('is-open');
    openId = inst.id;
  }

  function close(inst) {
    if (!inst) return;
    inst.panel?.classList.add('hidden');
    inst.root?.classList.remove('is-open');
    if (openId === inst.id) openId = null;
  }

  function toggle(inst) {
    if (inst.panel.classList.contains('hidden')) open(inst);
    else close(inst);
  }

  /* Ein Klick daneben schliesst. In der Capture-Phase, damit das Raster
     darunter den Klick nicht vorher als Auswahl einer Kachel deutet. */
  document.addEventListener('mousedown', ev => {
    if (!openId) return;
    const inst = instances.get(openId);
    if (inst && !inst.root.contains(ev.target)) close(inst);
  }, true);

  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape' && openId) {
      close(instances.get(openId));
      /* Nicht weiterreichen: sonst schliesst dasselbe Escape auch das
         Datenblatt dahinter, und zwei Fenster gehen auf einen Tastendruck zu. */
      ev.stopPropagation();
    }
  }, true);

  return {
    /**
     * Das Feld einhaengen - so oft aufrufbar, wie das Raster gezeichnet wird.
     *
     * @param hostId     Kennung des Wirts (die alte .ducats-sort-wrap)
     * @param options    [[key, label, kurz], ...] - `kurz` steht auf dem Knopf
     * @param value      die Kette, in der Reihenfolge ihrer Wirkung
     * @param fallback   worauf "Back to default" zurueckfaellt
     * @param exclusive  Kriterien, die allein stehen - siehe pick()
     * @param onChange   bekommt die neue Kette als Array
     */
    mount(hostId, { options, value, fallback = null, exclusive = [], onChange }) {
      const host = document.getElementById(hostId);
      if (!host || !Array.isArray(options) || !options.length) return;

      const keys = options.map(o => o[0]);
      /* Woran sich erkennen laesst, dass es dasselbe Feld mit demselben Inhalt
         ist: Reihenfolge der Optionen UND Reihenfolge der Kette. Nur wenn sich
         etwas davon aendert, wird ueberhaupt angefasst. */
      const sig = keys.join(',') + '|' + (value || []).join(',');

      let inst = instances.get(hostId);
      if (inst && inst.sig === sig) {
        inst.onChange = onChange;
        inst.exclusive = new Set(exclusive);
        return;
      }

      const sameOptions = inst && inst.keys.join(',') === keys.join(',');
      if (!inst) {
        inst = { id: hostId, host };
        instances.set(hostId, inst);
      }

      inst.host = host;
      inst.keys = keys;
      inst.labels = new Map(options.map(o => [o[0], o[1]]));
      inst.short = new Map(options.map(o => [o[0], o[2] || o[1]]));
      inst.value = Array.isArray(value) && value.length ? [...value] : [keys[0]];
      inst.fallback = fallback || keys[0];
      inst.exclusive = new Set(exclusive);
      inst.onChange = onChange;
      inst.sig = sig;

      /* Dasselbe Feld, nur eine andere Kette: die Kaestchen umschreiben statt
         das Feld neu zu bauen. Ein geoeffnetes Feld bliebe sonst nicht offen -
         und beim Waehlen des zweiten Kriteriums klappt es unter dem Zeiger zu. */
      if (sameOptions && inst.root?.isConnected) repaint(inst);
      else build(inst);
    },

    /** Ein Feld verbergen oder zeigen - der Wirt traegt die Klasse. */
    toggleHidden(hostId, hidden) {
      document.getElementById(hostId)?.classList.toggle('hidden', !!hidden);
      if (hidden && openId === hostId) close(instances.get(hostId));
    },

    /**
     * Die Kette als EIN Vergleich.
     *
     * `axes` haelt je Kriterium einen Vergleich, der NUR seine eigene Achse
     * kennt - ohne eingebauten Namensvergleich. Der steckte frueher in jeder
     * Sortierung, und mit ihm bliebe nach dem ersten Kriterium nie ein
     * Gleichstand uebrig: das zweite haette nichts mehr zu entscheiden.
     * Er kommt deshalb als LETZTES Glied dazu.
     */
    chain(keys, axes, tie = null) {
      const cmps = (keys || []).map(k => axes[k]).filter(Boolean);
      if (!cmps.length) return tie || null;
      return (a, b) => {
        for (const cmp of cmps) {
          const r = cmp(a, b);
          if (r) return r;
        }
        return tie ? tie(a, b) : 0;
      };
    },

    /** Absteigend nach einer Zahl; was unbekannt ist, geht ans Ende. */
    descUnknownLast(pick) {
      return (a, b) => {
        const va = pick(a);
        const vb = pick(b);
        if (va == null || vb == null) return (va == null) - (vb == null);
        return vb - va;
      };
    },

    /** Aufsteigend nach einer Zahl; die Null geht ans Ende, nicht nach vorn. */
    ascZeroLast(pick) {
      return (a, b) => {
        const va = pick(a) || 0;
        const vb = pick(b) || 0;
        if (!va || !vb) return (va === 0) - (vb === 0);
        return va - vb;
      };
    }
  };
})();
