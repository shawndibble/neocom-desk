import { useEffect } from 'react';
import { create } from 'zustand';
import { nearestHub } from '@/engine/contracts/baselineRegions';
import { MINUTE_MS } from '@/lib/age';
import { TRADE_HUBS } from '@/market/hubs';
import type { HubId } from './characterHubs';

const CLOSEST_FRESH_MS = 5 * MINUTE_MS;

async function workOutClosestHub(characterId: number): Promise<HubId | null> {
  const [{ loadCurrentSystemId }, { loadJumpBasis }, { localJumpDistances }] = await Promise.all([
    import('@/features/route/currentSystem'),
    import('@/features/route/jumpBasis'),
    import('@/features/route/localRoute'),
  ]);
  const [origin, basis] = await Promise.all([loadCurrentSystemId(characterId), loadJumpBasis()]);
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

export function resetClosestHubs(): void {
  inFlight.clear();
  useClosestHubs.setState({ byCharacter: {} });
}

export function loadClosestHub(characterId: number): Promise<HubId | null> {
  const known = useClosestHubs.getState().byCharacter[String(characterId)];
  if (known && Date.now() - known.at < CLOSEST_FRESH_MS) return Promise.resolve(known.hubId);
  const running = inFlight.get(characterId);
  if (running) return running;
  const remember = (hubId: HubId | null, at: number) => {
    useClosestHubs.setState((state) => ({
      byCharacter: { ...state.byCharacter, [String(characterId)]: { hubId, at } },
    }));
    return hubId;
  };
  const load = workOutClosestHub(characterId)
    .then(
      (hubId) => remember(hubId, Date.now()),
      () => remember(known?.hubId ?? null, 0)
    )
    .finally(() => inFlight.delete(characterId));
  inFlight.set(characterId, load);
  return load;
}

export function closestHubKnown(characterId: number): HubId | null {
  return useClosestHubs.getState().byCharacter[String(characterId)]?.hubId ?? null;
}

export function useClosestHub(
  characterId: number | null,
  wanted: boolean
): { hubId: HubId | null; loaded: boolean } {
  const answer = useClosestHubs((state) =>
    characterId === null ? undefined : state.byCharacter[String(characterId)]
  );
  useEffect(() => {
    if (!wanted || characterId === null) return;
    void loadClosestHub(characterId);
    const timer = setInterval(() => void loadClosestHub(characterId), CLOSEST_FRESH_MS);
    return () => clearInterval(timer);
  }, [wanted, characterId]);
  if (!wanted || characterId === null) return { hubId: null, loaded: true };
  return { hubId: answer?.hubId ?? null, loaded: answer !== undefined };
}
