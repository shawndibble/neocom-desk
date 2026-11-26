export const TYPE_INFO_SHARD_WIDTH = 2000;
export const TYPE_INFO_SHARD_COUNT = 64;

export interface TypeInfoRecord {
  description: string;
  attributes: [number, number][];
  effects: number[];
  defaultEffect?: number;
  volume?: number;
  packagedVolume?: number;
}

export type TypeInfoShard = Record<string, TypeInfoRecord>;

export function typeInfoBucket(typeId: number): number | null {
  const shard = Math.floor(typeId / TYPE_INFO_SHARD_WIDTH);
  return shard >= 0 && shard < TYPE_INFO_SHARD_COUNT ? shard : null;
}

export function typeInfoShardFile(typeId: number): string | null {
  const shard = typeInfoBucket(typeId);
  return shard === null ? null : `typeInfo/${shard}.json`;
}
