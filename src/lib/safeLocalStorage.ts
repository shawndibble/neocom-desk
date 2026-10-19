/**
 * Guarded `localStorage` access. Storage can be blocked outright (a privacy
 * mode, a sandboxed frame) or full, and none of these callers may be taken
 * down by it: a failed read is "nothing stored", a failed write or remove is
 * dropped. Synchronous, device-local only — for Dexie-backed preferences use
 * `createLocalSetting`.
 */
export function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeLocal(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Blocked or full: the value just isn't remembered.
  }
}

export function removeLocal(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Blocked: nothing to remove.
  }
}
