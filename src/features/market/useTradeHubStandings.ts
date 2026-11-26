import { idSetKey } from '@/lib/idSetKey';
import { useCallback } from 'react';
import { loadCharacterStandings } from '@/features/character/standings';
import { resolveLocationStandings } from './locationStandings';
import { ZERO_STANDINGS, type ResolvedStandings } from '@/engine/market/standings';
import { getTradeHub, hubFeeDiscountFactor, TRADE_HUBS, type TradeHub } from '@/market/hubs';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import { useWarmLoad } from '@/lib/useWarmLoad';
import { useKeyedLoad } from '@/lib/useAsyncLoad';

export type TradeHubStandingsMap = ReadonlyMap<TradeHub['id'], ResolvedStandings>;

const NO_STANDINGS: TradeHubStandingsMap = new Map();

async function resolveHubStandings(
  hub: TradeHub,
  entries: Parameters<typeof resolveLocationStandings>[1]
): Promise<ResolvedStandings> {
  const standing = await resolveLocationStandings(hub.stationId, entries);
  return withHubFeeModifiers(hub, standing);
}

function withHubFeeModifiers(hub: TradeHub, standing: ResolvedStandings): ResolvedStandings {
  const feeDiscountFactor = hubFeeDiscountFactor(hub, Date.now());
  if (hub.safetyTaxPct <= 0 && feeDiscountFactor === 1) return standing;
  return {
    ...standing,
    ...(hub.safetyTaxPct > 0 ? { safetyTaxPct: hub.safetyTaxPct } : {}),
    ...(feeDiscountFactor !== 1 ? { feeDiscountFactor } : {}),
  };
}

async function loadTradeHubStandings(characterId: number): Promise<TradeHubStandingsMap> {
  const entries = await loadCharacterStandings(characterId);
  const resolved = await Promise.all(
    TRADE_HUBS.map(async (hub) => [hub.id, await resolveHubStandings(hub, entries)] as const)
  );
  return new Map(resolved);
}

export function useTradeHubStandings(characterId: number | null): TradeHubStandingsMap {
  return useWarmLoad('tradeHubStandings', characterId, loadTradeHubStandings, NO_STANDINGS);
}

const NO_STANDINGS_BY_CHARACTER: ReadonlyMap<number, TradeHubStandingsMap> = new Map();

export function useTradeHubStandingsByCharacter(
  characterIds: readonly number[]
): ReadonlyMap<number, TradeHubStandingsMap> {
  const key = idSetKey(characterIds);
  const load = useCallback(async (): Promise<ReadonlyMap<number, TradeHubStandingsMap>> => {
    const byCharacter = new Map<number, TradeHubStandingsMap>();
    await mapWithConcurrencyLimit(characterIds, ESI_FANOUT_CONCURRENCY, async (characterId) => {
      const entries = await loadCharacterStandings(characterId);
      const resolved = await Promise.all(
        TRADE_HUBS.map(async (hub) => [hub.id, await resolveHubStandings(hub, entries)] as const)
      );
      byCharacter.set(characterId, new Map(resolved));
    });
    return byCharacter;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the id set's real identity; `characterIds` itself is intentionally not a dep (see the comment above `key`).
  }, [key]);
  return useKeyedLoad(key, load).data ?? NO_STANDINGS_BY_CHARACTER;
}

const zeroStandingsCache = new Map<TradeHub['id'], ResolvedStandings>();

export function zeroStandingsAt(hubId: TradeHub['id']): ResolvedStandings {
  const hub = getTradeHub(hubId);
  if (!hub) return ZERO_STANDINGS;
  const resolved = withHubFeeModifiers(hub, ZERO_STANDINGS);
  const cached = zeroStandingsCache.get(hubId);
  if (
    cached &&
    cached.safetyTaxPct === resolved.safetyTaxPct &&
    cached.feeDiscountFactor === resolved.feeDiscountFactor
  ) {
    return cached;
  }
  zeroStandingsCache.set(hubId, resolved);
  return resolved;
}

export function tradeHubStanding(
  standings: TradeHubStandingsMap,
  hubId: TradeHub['id']
): ResolvedStandings {
  return standings.get(hubId) ?? zeroStandingsAt(hubId);
}
