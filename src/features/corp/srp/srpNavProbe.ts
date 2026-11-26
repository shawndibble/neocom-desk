import { HOUR_MS, MINUTE_MS } from '@/lib/age';
export const SRP_PROBE_TTL_MS = HOUR_MS;
export const SRP_PROBE_FAILURE_BACKOFF_MS = 5 * MINUTE_MS;
const keyOf = (characterId: number, corporationId: number) =>
  `neocom:srp-on:${characterId}:${corporationId}`;

export interface SrpProbe {
  on: boolean;
  fresh: boolean;
}

export function readSrpProbe(
  characterId: number,
  corporationId: number,
  now: number
): SrpProbe | null {
  try {
    const raw = localStorage.getItem(keyOf(characterId, corporationId));
    if (raw === null) return null;
    const stored = JSON.parse(raw) as { on?: unknown; at?: unknown };
    if (typeof stored.on !== 'boolean' || typeof stored.at !== 'number') return null;
    return { on: stored.on, fresh: now - stored.at <= SRP_PROBE_TTL_MS };
  } catch {
    return null;
  }
}

const failureKeyOf = (characterId: number, corporationId: number) =>
  `neocom:srp-probe-failed:${characterId}:${corporationId}`;

export function srpProbeBackingOff(
  characterId: number,
  corporationId: number,
  now: number
): boolean {
  try {
    const at = Number(localStorage.getItem(failureKeyOf(characterId, corporationId)));
    return Number.isFinite(at) && at > 0 && now - at < SRP_PROBE_FAILURE_BACKOFF_MS;
  } catch {
    return false;
  }
}

function recordProbeFailure(characterId: number, corporationId: number, now: number): void {
  try {
    localStorage.setItem(failureKeyOf(characterId, corporationId), String(now));
  } catch {}
}

const listeners = new Set<() => void>();

export function subscribeSrpProbe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function recordSrpProbe(
  characterId: number,
  corporationId: number,
  on: boolean,
  now: number = Date.now()
): void {
  try {
    localStorage.setItem(keyOf(characterId, corporationId), JSON.stringify({ on, at: now }));
    localStorage.removeItem(failureKeyOf(characterId, corporationId));
  } catch {}
  for (const listener of listeners) listener();
}

const inflight = new Map<string, Promise<boolean | null>>();

export function probeSrp(characterId: number, corporationId: number): Promise<boolean | null> {
  const key = keyOf(characterId, corporationId);
  const running = inflight.get(key);
  if (running) return running;
  if (srpProbeBackingOff(characterId, corporationId, Date.now())) {
    return Promise.resolve(readSrpProbe(characterId, corporationId, Date.now())?.on ?? null);
  }
  const run = (async () => {
    try {
      const { srpMemberBackend } = await import('./srpMemberBackend');
      const { enabled } = await srpMemberBackend().status(characterId, corporationId);
      recordSrpProbe(characterId, corporationId, enabled);
      return enabled;
    } catch {
      recordProbeFailure(characterId, corporationId, Date.now());
      return readSrpProbe(characterId, corporationId, Date.now())?.on ?? null;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, run);
  return run;
}
