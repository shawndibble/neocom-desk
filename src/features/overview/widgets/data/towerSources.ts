/**
 * The towers as clocks and as Structures rows: pure, with no widget copy, so the Structures
 * widget (a startup kind) can use them without pulling the Starbases builder, and its copy,
 * into the startup graph (`localeSplit.test.ts` holds that line). `corpStarbaseModels.ts`
 * re-exports them for the Starbases page and widget.
 */
import type { BoardStarbaseSource } from '@/engine/corp/board';
import { TOWER_FUEL_PER_HOUR, towerFuelExpiresMs, towerLabel } from '@/engine/corp/starbases';
import type { StructureSource } from '@/features/corp/structures/structureRows';
import type { CorpStarbaseRow, CorpStarbasesFeed } from './corpFeeds';

/** When the fuel runs out, from the moment this tower's bay was read; null when it cannot be told. */
export function fuelExpiresMs(row: CorpStarbaseRow, fallbackReadAtMs: number): number | null {
  return towerFuelExpiresMs(row, row.bayReadAtMs ?? fallbackReadAtMs);
}

/** Due soon's view of the towers: each fuel clock and each reinforcement or unanchor timer. */
export function toBoardStarbases(feed: CorpStarbasesFeed, nowMs: number): BoardStarbaseSource[] {
  const readAtMs = feed.fetchedAt?.getTime() ?? nowMs;
  return feed.starbases.map((row) => ({
    starbaseId: row.starbaseId,
    name: towerName(feed, row),
    fuelExpiresMs: fuelExpiresMs(row, readAtMs),
    reinforcedUntilMs: row.reinforcedUntilMs,
    unanchorsAtMs: row.unanchorsAtMs,
  }));
}

/**
 * The towers as Structures rows: a control tower is a structure that needs
 * fuel, so it lists beside the Upwell ones. Its board clocks come from
 * `toBoardStarbases`, the same instant for both.
 */
export function toStructureSources(feed: CorpStarbasesFeed, nowMs: number): StructureSource[] {
  const readAtMs = feed.fetchedAt?.getTime() ?? nowMs;
  return feed.starbases.map((row) => {
    const perHour = TOWER_FUEL_PER_HOUR.get(row.typeId);
    return {
      structureId: row.starbaseId,
      name: towerName(feed, row),
      fuelExpiresMs: fuelExpiresMs(row, readAtMs),
      state: row.state === 'unknown' ? null : row.state,
      stateTimerEndMs: row.reinforcedUntilMs,
      unanchorsAtMs: row.unanchorsAtMs,
      services: [],
      corporationId: feed.corporationOf?.get(String(row.starbaseId)),
      systemId: row.systemId,
      typeId: row.typeId,
      tower: {
        blocks: row.bay?.fuelBlocks ?? null,
        perDay: perHour === undefined ? null : perHour * 24,
      },
    };
  });
}

function towerName(feed: CorpStarbasesFeed, row: CorpStarbaseRow): string {
  return towerLabel(
    feed.typeNames.get(row.typeId) ?? `#${row.typeId}`,
    feed.systemNames.get(row.systemId)
  );
}
