import { deserialize, SaveError, serialize } from '../sim/save';
import type { GameState } from '../sim/state';

/**
 * The island you're playing, kept in the browser. One slot.
 * What carries between cycles lives apart from this, in legacyStore.ts.
 */
const KEY = 'fogbound.save';
/** A save that could not be read is moved here instead of being overwritten. */
const BROKEN_KEY = 'fogbound.save.unreadable';

export type LoadResult = { state: GameState } | { state: null; error?: string };

export function loadGame(): LoadResult {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return { state: null };
  }
  if (!raw) return { state: null };
  try {
    return { state: deserialize(raw) };
  } catch (e) {
    try {
      localStorage.setItem(BROKEN_KEY, raw);
      localStorage.removeItem(KEY);
    } catch {
      // Leave it be.
    }
    return { state: null, error: e instanceof SaveError ? e.message : 'Your save could not be read.' };
  }
}

/** Returns false if the browser would not store it. */
export function saveGame(state: GameState): boolean {
  try {
    localStorage.setItem(KEY, serialize(state));
    return true;
  } catch {
    return false;
  }
}

/** Store a save string as-is (after an import has been checked). */
export function storeRaw(text: string): boolean {
  try {
    localStorage.setItem(KEY, text);
    return true;
  } catch {
    return false;
  }
}

export function clearGame(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
