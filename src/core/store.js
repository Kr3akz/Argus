/**
 * Persistenz fuer Farm-Ziele und Notizen.
 * Reine lokale JSON-Datei - nichts davon verlaesst den Rechner.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const FILE = () => path.join('data', 'goals.json');

export const DEFAULT_NOTIFICATIONS = () => ({
  enabled: true,
  sound: true,
  desktopToast: true,
  fissures: {
    enabled: true,
    allMissionTypes: false,
    missionTypes: ['Void Cascade'],
    tiers: ['Lith', 'Meso', 'Neo', 'Axi', 'Requiem', 'Omnia'],
    steelPathOnly: false,
    includeSteelPath: true,
    includeStorms: true
  }
});

const empty = () => ({
  goals: [],
  notes: {},
  generalNotes: '',
  builds: [],
  ownedMods: [],
  notifications: DEFAULT_NOTIFICATIONS()
});

export async function load() {
  if (!existsSync(FILE())) return empty();
  try {
    const parsed = JSON.parse(await readFile(FILE(), 'utf8'));
    const defNotif = DEFAULT_NOTIFICATIONS();
    const rawNotif = parsed.notifications || {};
    return {
      goals: Array.isArray(parsed.goals) ? parsed.goals : [],
      notes: parsed.notes && typeof parsed.notes === 'object' ? parsed.notes : {},
      generalNotes: typeof parsed.generalNotes === 'string' ? parsed.generalNotes : '',
      builds: Array.isArray(parsed.builds) ? parsed.builds : [],
      ownedMods: Array.isArray(parsed.ownedMods) ? parsed.ownedMods : [],
      notifications: {
        ...defNotif,
        ...rawNotif,
        fissures: {
          ...defNotif.fissures,
          ...(rawNotif.fissures || {})
        }
      }
    };
  } catch {
    return empty();   // beschaedigte Datei blockiert die App nicht
  }
}

async function save(state) {
  await mkdir('data', { recursive: true });
  await writeFile(FILE(), JSON.stringify(state, null, 2));
  return state;
}

/** Ziel aufnehmen. Doppelte werden ignoriert. */
export async function addGoal(uniqueName, name) {
  const s = await load();
  if (s.goals.some(g => g.uniqueName === uniqueName)) return s;
  s.goals.push({ uniqueName, name, addedAt: Date.now(), done: false });
  return save(s);
}

export async function removeGoal(uniqueName) {
  const s = await load();
  s.goals = s.goals.filter(g => g.uniqueName !== uniqueName);
  return save(s);
}

export async function toggleGoal(uniqueName) {
  const s = await load();
  const g = s.goals.find(x => x.uniqueName === uniqueName);
  if (g) g.done = !g.done;
  return save(s);
}

/** Notiz zu einem Item. Leerer Text loescht sie. */
export async function setNote(uniqueName, text) {
  const s = await load();
  if (text && text.trim()) s.notes[uniqueName] = text;
  else delete s.notes[uniqueName];
  return save(s);
}

export async function setGeneralNotes(text) {
  const s = await load();
  s.generalNotes = text ?? '';
  return save(s);
}

/* ---------------------------- Builds ---------------------------- */

export async function addBuild(build) {
  const s = await load();
  const id = build.id || `b${Date.now().toString(36)}`;
  s.builds.push({ ...build, id, addedAt: Date.now() });
  return save(s);
}

export async function removeBuild(id) {
  const s = await load();
  s.builds = s.builds.filter(b => b.id !== id);
  return save(s);
}

export async function updateBuild(id, patch) {
  const s = await load();
  const b = s.builds.find(x => x.id === id);
  if (b) Object.assign(b, patch);
  return save(s);
}

/* -------------------------- Mod-Besitz -------------------------- */

/**
 * Mods werden nur erfasst, wenn sie in einem Build vorkommen - deshalb eine
 * schlichte Liste statt einer Abhak-Tabelle ueber alle 1.280 Mods.
 */
export async function setModOwned(uniqueName, owned) {
  const s = await load();
  const set = new Set(s.ownedMods);
  if (owned) set.add(uniqueName);
  else set.delete(uniqueName);
  s.ownedMods = [...set];
  return save(s);
}

export async function setManyModsOwned(uniqueNames, owned) {
  const s = await load();
  const set = new Set(s.ownedMods);
  for (const u of uniqueNames) { if (owned) set.add(u); else set.delete(u); }
  s.ownedMods = [...set];
  return save(s);
}

/* ----------------------- Benachrichtigungen ----------------------- */

export async function updateNotificationSettings(patch) {
  const s = await load();
  s.notifications = {
    ...s.notifications,
    ...patch,
    fissures: {
      ...s.notifications.fissures,
      ...(patch.fissures || {})
    }
  };
  return save(s);
}

