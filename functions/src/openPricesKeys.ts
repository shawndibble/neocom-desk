export const OPEN_PRICES_R2_PREFIX = 'open-prices/';

export function openPricesR2Key(typeId: number): string {
  return `${OPEN_PRICES_R2_PREFIX}${typeId}.json`;
}

export const OPEN_PRICES_SHARD_COUNT = 4096;

export function openPricesShardR2Key(typeId: number): string {
  return `${OPEN_PRICES_R2_PREFIX}shards/${typeId % OPEN_PRICES_SHARD_COUNT}.json`;
}
