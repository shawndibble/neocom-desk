/**
 * Where open prices live in R2. Dependency-free so the client's parity test can
 * import it (`src/functionsParity.test.ts`).
 */

export const OPEN_PRICES_R2_PREFIX = 'open-prices/';

/** One type's own object: the layout before shards, still read as a fallback. */
export function openPricesR2Key(typeId: number): string {
  return `${OPEN_PRICES_R2_PREFIX}${typeId}.json`;
}

/**
 * Types share an object, `typeId % OPEN_PRICES_SHARD_COUNT`, holding
 * `{ types: { <typeId>: TypeOpenPrices } }`: R2 bills every write, so a few
 * thousand objects a day instead of one per type
 * (docs/context/decisions/20261104-065346-r2-snapshots-publish-few-big-objects-not-one.md).
 * Mirrors `OPEN_PRICES_SHARD_COUNT` in `src/features/market/marketOpenPrices.ts`.
 */
export const OPEN_PRICES_SHARD_COUNT = 4096;

export function openPricesShardR2Key(typeId: number): string {
  return `${OPEN_PRICES_R2_PREFIX}shards/${typeId % OPEN_PRICES_SHARD_COUNT}.json`;
}
