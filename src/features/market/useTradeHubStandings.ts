/**
 * Every NPC Trade Hub's broker-fee standings for one character, resolved
 * once per character (issue #1238) rather than per call site: every page
 * that prices against a configurable Trade Hub (`src/market/hubs.ts`) reads
 * `plan.hubId`/the Market Hub setting and needs the matching
 * `ResolvedStandings`, and there are only 5 hubs — resolving all of them
 * up front means every caller can do a plain map lookup instead of its own
 * fetch effect.
 *
 * Left stale while a new character's fetch is in flight, same as
 * `useIndustryWorkspace`'s own `skills`/`implantBonusPct` state — a brief
 * previous-character reading during the fetch is the same trade that state
 * already makes, not a new one.
 */
import { useEffect, useState } from 'react';
import { loadCharacterStandings } from '@/features/character/standings';
import { resolveLocationStandings } from './locationStandings';
import { ZERO_STANDINGS, type ResolvedStandings } from '@/engine/market/standings';
import { TRADE_HUBS, type TradeHub } from '@/market/hubs';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';

export type TradeHubStandingsMap = ReadonlyMap<TradeHub['id'], ResolvedStandings>;

export function useTradeHubStandings(characterId: number | null): TradeHubStandingsMap {
  const [standings, setStandings] = useState<TradeHubStandingsMap>(new Map());

  useEffect(() => {
    if (characterId === null) return;
    let cancelled = false;
    void (async () => {
      const entries = await loadCharacterStandings(characterId);
      const resolved = await Promise.all(
        TRADE_HUBS.map(
          async (hub) => [hub.id, await resolveLocationStandings(hub.stationId, entries)] as const
        )
      );
      if (!cancelled) setStandings(new Map(resolved));
    })();
    return () => {
      cancelled = true;
    };
  }, [characterId]);

  return standings;
}

/**
 * Every given Character's `TradeHubStandingsMap`, fanned out and cached — for
 * Build Opportunities (issue #2055), which prices candidates owned by however
 * many Characters the pilot's filter resolves to, each against its own owning
 * Character's real standings rather than one active Character's. A Character
 * absent from the result had no resolved standings yet; callers should read
 * that the same way `tradeHubStanding` reads a missing hub — as zero, via
 * `tradeHubStanding(standingsByCharacter.get(characterId) ?? new Map(), hubId)`.
 *
 * Mirrors `useAccountSkillLevels`'s value-stable-key shape: `key` is the id
 * set's real identity (order-independent), so an upstream caller that rebuilds
 * its id array on every render does not restart this fan-out.
 */
export function useTradeHubStandingsByCharacter(
  characterIds: readonly number[]
): ReadonlyMap<number, TradeHubStandingsMap> {
  const [standingsByCharacter, setStandingsByCharacter] = useState<
    ReadonlyMap<number, TradeHubStandingsMap>
  >(new Map());
  const key = [...characterIds].sort((a, b) => a - b).join(',');

  useEffect(() => {
    let cancelled = false;
    const byCharacter = new Map<number, TradeHubStandingsMap>();
    void mapWithConcurrencyLimit(characterIds, ESI_FANOUT_CONCURRENCY, async (characterId) => {
      const entries = await loadCharacterStandings(characterId);
      const resolved = await Promise.all(
        TRADE_HUBS.map(
          async (hub) => [hub.id, await resolveLocationStandings(hub.stationId, entries)] as const
        )
      );
      byCharacter.set(characterId, new Map(resolved));
    }).then(() => {
      if (!cancelled) setStandingsByCharacter(byCharacter);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the id set's real identity; `characterIds` itself is intentionally not a dep (see the comment above `key`).
  }, [key]);

  return standingsByCharacter;
}

/** `standings.get(hubId)`, defaulting to zero for a hub not yet resolved. */
export function tradeHubStanding(
  standings: TradeHubStandingsMap,
  hubId: TradeHub['id']
): ResolvedStandings {
  return standings.get(hubId) ?? ZERO_STANDINGS;
}
