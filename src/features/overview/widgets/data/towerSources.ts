import type { BoardStarbaseSource } from '@/engine/corp/board';
import { TOWER_FUEL_PER_HOUR, towerFuelExpiresMs, towerLabel } from '@/engine/corp/starbases';
import type { StructureSource } from '@/features/corp/structures/structureRows';
import type { CorpStarbaseRow, CorpStarbasesFeed } from './corpFeeds';

export function fuelExpiresMs(row: CorpStarbaseRow, fallbackReadAtMs: number): number | null {
  return towerFuelExpiresMs(row, row.bayReadAtMs ?? fallbackReadAtMs);
}

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
