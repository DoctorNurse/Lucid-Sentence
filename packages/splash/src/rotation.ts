import type { Promo } from './promos.js';

/** Minimal storage interface (localStorage-compatible). */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const ROTATION_KEY = 'lucid-sentence:promo-rotation';

function safeStorage(): KeyValueStore | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined; // e.g. storage disabled by privacy settings
  }
}

/**
 * Round-robin: returns the promo after the one shown last launch and records it.
 * Only the index of the last promo shown is stored locally. Nothing is sent
 * anywhere.
 */
export function nextPromo(
  list: readonly Promo[],
  storage: KeyValueStore | undefined = safeStorage(),
): Promo | undefined {
  if (list.length === 0) return undefined;
  let last = -1;
  try {
    const raw = storage?.getItem(ROTATION_KEY);
    const parsed = raw === null || raw === undefined ? NaN : Number.parseInt(raw, 10);
    if (Number.isInteger(parsed)) last = parsed;
  } catch {
    // ignore unreadable storage
  }
  const index = (((last + 1) % list.length) + list.length) % list.length;
  try {
    storage?.setItem(ROTATION_KEY, String(index));
  } catch {
    // ignore quota or privacy errors; rotation just restarts
  }
  return list[index];
}

let claimed = false;

/**
 * One promo per launch, at most. The first caller in this page/app lifetime
 * gets the next promo; every later call returns undefined.
 */
export function claimLaunchPromo(
  list: readonly Promo[],
  storage?: KeyValueStore,
): Promo | undefined {
  if (claimed) return undefined;
  claimed = true;
  return storage === undefined ? nextPromo(list) : nextPromo(list, storage);
}

/** Test helper: start a new "launch". */
export function resetLaunchForTesting(): void {
  claimed = false;
}
