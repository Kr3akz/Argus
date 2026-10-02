/**
 * Was das Handy von den grossen Antworten des Hauptprozesses bekommt.
 *
 * WARUM ES DAS BRAUCHT:
 *   Die Kanaele, die der Renderer benutzt, liefern fuer ein Fenster mit
 *   viel Platz: das Inventar mit jeder Mod-Karte und jedem Datenblatt, das
 *   Dashboard mit Katalog-Vorschlaegen ueber zwei Reihen. Ueber das WLAN und
 *   auf einen Bildschirm von sechs Zoll waere das das Vielfache dessen, was
 *   die Handy-App zeigt. Hier wird zurechtgeschnitten - nichts gerechnet,
 *   nichts erfunden: jede Zahl stammt aus derselben Antwort wie am PC.
 *
 * Alles hier ist rein. Fehlt ein Teil der Antwort, bleibt das Feld leer,
 * statt den Aufruf scheitern zu lassen.
 */

const row = r => ({
  name: r?.name ?? '',
  image: r?.image ?? null,
  count: r?.count ?? null,
  have: r?.have ?? null,
  building: r?.building || 0,
  enough: r?.enough ?? null
});

const quellen = ds => (ds?.groups || []).slice(0, 4).map(g => ({
  label: g.label,
  entries: (g.entries || []).slice(0, 4).map(e => ({
    place: e.place ?? '',
    detail: e.detail ?? e.rotation ?? null,
    chance: e.chanceText ?? null
  }))
}));

/** Ziele, Einkaufsliste und der Profilkopf. */
export function slimDashboard(d) {
  if (!d) return null;
  const p = d.player || {};
  const goals = (d.goals || []).map(g => ({
    uniqueName: g.uniqueName,
    name: g.name,
    image: g.image ?? null,
    done: !!g.done,
    status: g.status ?? null,
    owned: !!g.owned,
    kind: g.kind ?? null,
    rank: g.rank ?? 0,
    maxLvl: g.maxLvl ?? null,
    isUpgrade: !!g.isUpgrade,
    upgradeKind: g.upgradeKind ?? null,
    buildTime: g.buildTime || '',
    credits: g.credits || 0,
    components: (g.components || []).map(row),
    materials: (g.materials || []).map(row),
    sources: g.isUpgrade ? quellen(g.dropSources) : [],
    note: g.note || ''
  }));
  return {
    player: {
      name: p.name ?? null,
      mr: p.mr ?? null,
      mrName: p.mrName ?? null,
      progress: p.progress ?? null,
      loadout: p.loadout ? { name: p.loadout.name, image: p.loadout.image } : null,
      clan: p.clan ?? null,
      openGain: p.openGain ?? null
    },
    fetchedAt: d.meta?.fetchedAt ?? null,
    goals: [...goals.filter(g => !g.done), ...goals.filter(g => g.done)],
    shopping: {
      materials: (d.shopping?.materials || []).map(row),
      credits: d.shopping?.credits || 0,
      buildTime: d.shopping?.buildTime || ''
    },
    quickWins: (d.quickWins || []).slice(0, 8).map(e => ({
      name: e.name, image: e.image ?? null, label: e.label ?? null, gain: e.gain ?? 0, status: e.status ?? null
    }))
  };
}

/** Die Foundry: klein genug, um fast so zu bleiben, wie sie ist. */
export function slimFoundry(res) {
  if (!res?.ok) return { empty: true, reason: res?.code || null };
  const q = res.data || {};
  return {
    empty: false,
    fetchedAt: q.fetchedAt ?? null,
    nextAt: q.nextAt ?? null,
    items: (q.items || []).map(i => ({
      name: i.name, image: i.image ?? null, count: i.count ?? 1,
      buildSeconds: i.buildSeconds ?? null, completionAt: i.completionAt ?? null, ready: !!i.ready
    })),
    helminth: q.helminth ? {
      ability: q.helminth.ability ?? null, readyAt: q.helminth.readyAt ?? null, busy: !!q.helminth.busy
    } : null
  };
}

const preis = p => (p ? { min: p.min ?? null, median: p.median ?? null, stale: !!p.stale } : null);

/* Mods und Arcanes mit einem Preis ab dieser Hoehe kommen mit. Darunter ist
   die Liste fuers Handy eine Suche ohne Antwort - die vollstaendige steht am
   PC im Inventar. */
const WERTVOLL_AB = 10;
const MAX_WERTVOLL = 60;

/**
 * Inventar und Preise: Relikte, Prime-Sets, Prime-Teile und die Karten, die
 * etwas wert sind.
 *
 * @param inv     Antwort von inventory:get
 * @param ducats  Antwort von ducats:get (die Teileliste mit Dukaten)
 */
export function slimInventory(inv, ducats) {
  if (!inv?.ok) return { empty: true, reason: inv?.code || null };
  const v = inv.data || {};
  const s = v.sections || {};

  const relics = (s.relics || []).filter(e => e.owned).map(e => ({
    name: e.name,
    tier: e.tier ?? null,
    quality: e.quality ?? null,
    count: e.count || 0,
    image: e.image ?? null,
    vaulted: e.vaulted ?? null,
    value: e.value ? { plat: e.value.expPlat ?? null, ducats: e.value.expDucats ?? null, best: e.value.bestPlat ?? null } : null
  }));

  const sets = (s.sets || []).filter(x => x.kind === 'prime' && x.ownedParts > 0).map(x => ({
    name: x.name,
    image: x.image ?? null,
    ownedParts: x.ownedParts,
    totalParts: x.totalParts,
    complete: !!x.complete,
    fullSets: x.fullSetsCount || 0,
    setPrice: preis(x.setPrice),
    ownedDucats: x.ownedDucats || 0,
    vaultSoon: x.vaultSoon ? { stage: x.vaultSoon.stage, days: x.vaultSoon.days ?? null } : null,
    parts: (x.parts || []).map(pt => ({
      name: pt.shortName || pt.name, count: pt.count || 0, required: pt.required || 1,
      ducats: pt.ducats ?? null, price: preis(pt.price)
    }))
  }));

  const wertvoll = [...(s.mods || []), ...(s.arcanes || [])]
    .filter(e => (e.count || 0) > 0 && (e.price?.min ?? 0) >= WERTVOLL_AB)
    .sort((a, b) => (b.price.min - a.price.min) || String(a.name).localeCompare(String(b.name), 'en'))
    .slice(0, MAX_WERTVOLL)
    .map(e => ({
      name: e.name, image: e.image ?? null, count: e.count, rank: e.maxRank ?? e.priceRank ?? 0,
      price: preis(e.price)
    }));

  const items = ducats?.inventory?.items || [];
  return {
    empty: false,
    fetchedAt: v.fetchedAt ?? null,
    syncedAt: v.syncedAt ?? null,
    currencies: v.currencies || null,
    relics,
    sets,
    parts: items.map(i => ({
      name: i.name, image: i.image ?? null, count: i.count, ducats: i.ducats,
      price: preis(i.price),
      advice: i.tradeAdvice?.advice ?? null, adviceLabel: i.tradeAdvice?.label ?? null
    })),
    partsSummary: ducats?.inventory?.summary || null,
    valuable: wertvoll,
    pricesFetchedAt: ducats?.pricesFetchedAt ?? null
  };
}

/* Mehr Zeilen, als ein Handy sinnvoll durchblaettert - wer weiter will,
   sucht genauer. Der PC zeigt bis zu 400. */
const MAX_DROPS = 120;

export function slimDrops(res) {
  if (!res || res.error) return { error: res?.error || 'no result', rows: [], total: 0 };
  return {
    rows: (res.rows || []).slice(0, MAX_DROPS).map(r => ({
      item: r.item, kind: r.kind, place: r.place, region: r.region ?? null, mode: r.mode ?? null,
      rotation: r.rotation ?? null, stage: r.stage ?? null, refinement: r.refinement ?? null,
      chance: r.chance ?? null, rarity: r.rarity ?? null, vaulted: r.vaulted ?? null, change: r.change ?? null
    })),
    total: res.total ?? 0,
    shown: Math.min(res.total ?? 0, MAX_DROPS),
    fetchedAt: res.fetchedAt ?? null
  };
}

/** Suchtext und Modus aus der Adresse der Handy-App in die Optionen der Suche. */
export function dropOptions(params = {}) {
  const mode = ['item', 'place', 'enemy'].includes(params.mode) ? params.mode : 'item';
  const kinds = String(params.kinds || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 10);
  return { q: String(params.q || '').slice(0, 80), mode, kinds, sort: 'match' };
}
