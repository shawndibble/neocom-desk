/**
 * Whether the pilot's corp has SRP on, for the nav: `getSrpStatus` needs no role or scope.
 * Cached 1h per Character and corporation; unknown reads as hidden.
 */
export const SRP_PROBE_TTL_MS = 60 * 60 * 1000;
/** Player corporation ids start here; NPC corporations (1,000,000s) never run SRP. */
const FIRST_PLAYER_CORPORATION_ID = 98_000_000;

export const isPlayerCorporation = (corporationId: number): boolean =>
  corporationId >= FIRST_PLAYER_CORPORATION_ID;

const keyOf = (characterId: number, corporationId: number) =>
  `neocom:srp-on:${characterId}:${corporationId}`;

export interface SrpProbe {
  on: boolean;
  /** Within the TTL; a stale answer still shows while the next read runs. */
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

const listeners = new Set<() => void>();

/** Called when the nav hook should re-read: after any recorded answer. */
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
  } catch {
    // Storage blocked: the entry simply re-asks next time.
  }
  for (const listener of listeners) listener();
}

const inflight = new Map<string, Promise<boolean | null>>();

/**
 * Asks the server and records the answer. Concurrent callers (the rail, the More sheet and the
 * palette all mount the hook) share one call. A failed read leaves the last answer standing,
 * or null when there was none.
 */
export function probeSrp(characterId: number, corporationId: number): Promise<boolean | null> {
  const key = keyOf(characterId, corporationId);
  const running = inflight.get(key);
  if (running) return running;
  const run = (async () => {
    try {
      // Dynamic: the nav hook is in the startup graph, which must not reach Firebase (bootImportGraph).
      const { srpMemberBackend } = await import('./srpMemberBackend');
      const { enabled } = await srpMemberBackend().status(characterId, corporationId);
      recordSrpProbe(characterId, corporationId, enabled);
      return enabled;
    } catch {
      return readSrpProbe(characterId, corporationId, Date.now())?.on ?? null;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, run);
  return run;
}
