import { FIRST_LEGACY, type Legacy } from '../sim/lore';

/**
 * What carries between cycles (relics, codex, names of the lost) is kept in the browser,
 * so ringing the bell and waking on a new island survives the page reload.
 * Saving the island itself comes with M6.
 */
const KEY = 'fogbound.legacy.v1';

export function loadLegacy(): Legacy {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return FIRST_LEGACY;
    const data = JSON.parse(raw) as Partial<Legacy>;
    return {
      cycle: typeof data.cycle === 'number' && data.cycle >= 1 ? data.cycle : 1,
      relics: Array.isArray(data.relics) ? data.relics : [],
      codex: data.codex && typeof data.codex === 'object' ? data.codex : {},
      echoes: Array.isArray(data.echoes) ? data.echoes : [],
    };
  } catch {
    return FIRST_LEGACY;
  }
}

export function saveLegacy(legacy: Legacy): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(legacy));
  } catch {
    // Storage blocked: the next cycle just starts fresh.
  }
}

export function clearLegacy(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
