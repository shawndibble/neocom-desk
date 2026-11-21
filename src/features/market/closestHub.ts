/**
 * Closest hub (issue #6523): the Trade Hub fewest jumps from a Character's
 * Current System (`currentSystem.ts`: the game location, or a system picked by
 * hand), by the pilot's saved route preference (`loadJumpBasis`), the earlier
 * listed hub on a tie (`nearestHub`). `null` with no location, or when the
 * stargate data cannot be read: the caller then falls back to the Global hub.
 *
 * Worked out on demand, only for a page (or a Global hub) set to Closest, and
 * kept per Character for a few minutes, so every reader on screen shares one
 * answer and a pilot who moved gets a fresh one soon after.
 */
import { useEffect } from 'react';
import { create } from 'zustand';
import { nearestHub } from '@/engine/contracts/baselineRegions';
import { MINUTE_MS } from '@/lib/age';
import { TRADE_HUBS } from '@/market/hubs';
import type { HubId } from './characterHubs';

/** How long an answer stands before the location is read again. */
const CLOSEST_FRESH_MS = 5 * MINUTE_MS;

// The route modules load only once a pilot picks Closest: every page reads `hub.ts`.
async function workOutClosestHub(characterId: number): Promise<HubId | null> {
  const [{ loadCurrentSystemId }, { loadJumpBasis }, { localJumpDistances }] = await Promise.all([
    import('@/features/route/currentSystem'),
    import('@/features/route/jumpBasis'),
    import('@/features/route/localRoute'),
  ]);
  const [origin, basis] = await Promise.all([
    loadCurrentSystemId(characterId).catch(() => null),
    loadJumpBasis(),
  ]);
  if (origin === null) return null;
  const distances = await localJumpDistances(origin, basis.rules, basis.network);
  return distances.kind === 'known' ? (nearestHub(TRADE_HUBS, distances.jumps)?.id ?? null) : null;
}

interface Answer {
  hubId: HubId | null;
  at: number;
}

interface ClosestHubState {
  byCharacter: Readonly<Record<string, Answer>>;
}

export const useClosestHubs = create<ClosestHubState>(() => ({ byCharacter: {} }));

const inFlight = new Map<number, Promise<HubId | null>>();

/** `characterId`'s Closest hub, read again when the last answer is a few minutes old. */
export function loadClosestHub(characterId: number): Promise<HubId | null> {
  const known = useClosestHubs.getState().byCharacter[String(characterId)];
  if (known && Date.now() - known.at < CLOSEST_FRESH_MS) return Promise.resolve(known.hubId);
  const running = inFlight.get(characterId);
  if (running) return running;
  const load = workOutClosestHub(characterId)
    .catch(() => null)
    .then((hubId) => {
      useClosestHubs.setState((state) => ({
        byCharacter: { ...state.byCharacter, [String(characterId)]: { hubId, at: Date.now() } },
      }));
      return hubId;
    })
    .finally(() => inFlight.delete(characterId));
  inFlight.set(characterId, load);
  return load;
}

/** The last Closest hub worked out for `characterId`, however old; `null` before one. */
export function closestHubKnown(characterId: number): HubId | null {
  return useClosestHubs.getState().byCharacter[String(characterId)]?.hubId ?? null;
}

/**
 * The Closest hub for `characterId`, worked out while `wanted`. `loaded` is
 * false only while the first answer is pending; with no Character there is no
 * location, so it is `null` at once.
 */
export function useClosestHub(
  characterId: number | null,
  wanted: boolean
): { hubId: HubId | null; loaded: boolean } {
  const answer = useClosestHubs((state) =>
    characterId === null ? undefined : state.byCharacter[String(characterId)]
  );
  useEffect(() => {
    if (wanted && characterId !== null) void loadClosestHub(characterId);
  }, [wanted, characterId]);
  if (!wanted || characterId === null) return { hubId: null, loaded: true };
  return { hubId: answer?.hubId ?? null, loaded: answer !== undefined };
}
