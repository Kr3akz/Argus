/** Lokale Konfiguration. Bleibt auf deinem Rechner - wird nirgends hochgeladen. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const FILE = path.join('data', 'config.json');
const DEFAULTS = { accountId: '', platform: 'pc', notes: {} };

export async function loadConfig() {
  if (!existsSync(FILE)) return { ...DEFAULTS };
  return { ...DEFAULTS, ...JSON.parse(await readFile(FILE, 'utf8')) };
}

export async function saveConfig(cfg) {
  await mkdir('data', { recursive: true });
  await writeFile(FILE, JSON.stringify(cfg, null, 2));
}
