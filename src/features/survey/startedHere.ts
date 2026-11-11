/**
 * Which Surveys this device started, so the visitor who pasted the first scan
 * on `/survey` can set the details (location, moon tax, notes) afterwards with
 * no account: the public page offers its editor to this device only. Local, not
 * synced, and best-effort like `submitted.ts`: cleared storage just means the
 * page reads as any visitor's. A Survey lasts a week, so an entry does too.
 */
import { readLocal, writeLocal } from '@/lib/safeLocalStorage';

const KEY = 'miningSurveysStarted';
/** A Survey's own lifetime, with a day of slack. */
const KEEP_MS = 8 * 24 * 60 * 60 * 1000;
const MAX_KEPT = 30;

interface Entry {
  id: string;
  at: number;
}

function read(now: number): Entry[] {
  try {
    const parsed: unknown = JSON.parse(readLocal(KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is Entry =>
        typeof e === 'object' &&
        e !== null &&
        typeof (e as Entry).id === 'string' &&
        typeof (e as Entry).at === 'number' &&
        now - (e as Entry).at < KEEP_MS
    );
  } catch {
    return [];
  }
}

export function noteStartedHere(id: string, now = Date.now()): void {
  const kept = read(now).filter((e) => e.id !== id);
  writeLocal(KEY, JSON.stringify([...kept, { id, at: now }].slice(-MAX_KEPT)));
}

export function startedHere(id: string, now = Date.now()): boolean {
  return read(now).some((e) => e.id === id);
}

/** The Surveys this device started that are still within their week. */
export function startedHereIds(now = Date.now()): string[] {
  return read(now).map((e) => e.id);
}

/** Drops one, once its Survey is gone or has an account behind it. */
export function forgetStartedHere(id: string, now = Date.now()): void {
  writeLocal(KEY, JSON.stringify(read(now).filter((e) => e.id !== id)));
}
