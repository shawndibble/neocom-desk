import { isRecord } from '@/engine/guards';
import { DAY_MS } from '@/lib/age';
import { readLocal, writeLocal } from '@/lib/safeLocalStorage';

const KEY = 'miningSurveysStarted';
const KEEP_MS = 8 * DAY_MS;
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
        isRecord(e) && typeof e.id === 'string' && typeof e.at === 'number' && now - e.at < KEEP_MS
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

export function startedHereIds(now = Date.now()): string[] {
  return read(now).map((e) => e.id);
}

export function forgetStartedHere(id: string, now = Date.now()): void {
  writeLocal(KEY, JSON.stringify(read(now).filter((e) => e.id !== id)));
}
