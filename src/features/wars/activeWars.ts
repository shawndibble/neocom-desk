import { DAY_MS, MINUTE_MS } from '@/lib/age';
import { parseStoredWars, type StoredWar } from '@/engine/wars';

export const ACTIVE_WARS_R2_URL = 'https://data.neocomdesk.com/active-wars/wars.json';
const R2_READ_TIMEOUT_MS = 20_000;
const ACTIVE_WARS_REREAD_MS = 55 * MINUTE_MS;
export const ACTIVE_WARS_POLL_MS = 15 * MINUTE_MS;
export const ACTIVE_WARS_STALE_AFTER_MS = DAY_MS;

const NONE: readonly StoredWar[] = [];

let lastRead: { at: number; data: unknown } | null = null;
let reading: Promise<void> | null = null;

async function readR2(): Promise<unknown> {
  try {
    const res = await fetch(ACTIVE_WARS_R2_URL, {
      signal: AbortSignal.timeout(R2_READ_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const body: unknown = await res.json();
    const stored = parseStoredWars(body);
    return stored !== null && Date.now() - stored.updatedAt <= ACTIVE_WARS_STALE_AFTER_MS
      ? body
      : null;
  } catch {
    return null;
  }
}

async function readList(): Promise<void> {
  const fromR2 = await readR2();
  if (fromR2 !== null) lastRead = { at: Date.now(), data: fromR2 };
}

export function freshActiveWars(data: unknown, now: number): readonly StoredWar[] {
  const stored = parseStoredWars(data);
  if (stored === null || now - stored.updatedAt > ACTIVE_WARS_STALE_AFTER_MS) return NONE;
  return stored.wars;
}

export async function loadActiveWars(): Promise<readonly StoredWar[]> {
  if (lastRead === null || Date.now() - lastRead.at >= ACTIVE_WARS_REREAD_MS) {
    reading ??= readList().finally(() => {
      reading = null;
    });
    await reading;
  }
  return freshActiveWars(lastRead?.data, Date.now());
}

export function resetActiveWarsCache(): void {
  lastRead = null;
  reading = null;
}
