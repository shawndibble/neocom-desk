import type { UniverseType } from '@/esi/endpoints';
import { loadUniverseTypeOnce } from '@/features/skills/data';
import { loadTypeInfo } from '@/sde/loadTypeInfo';
import type { TypeInfoRecord } from '@/sde/typeInfoShard';

/** The fields of ESI's `/universe/types/{id}` that Item Detail reads — all a baked record carries. */
export type ItemDetailType = Pick<UniverseType, 'description' | 'volume' | 'dogma_attributes'>;

function fromTypeInfo(record: TypeInfoRecord): ItemDetailType {
  return {
    description: record.description,
    ...(record.volume !== undefined && { volume: record.volume }),
    dogma_attributes: record.attributes.map(([attribute_id, value]) => ({ attribute_id, value })),
  };
}

/**
 * One item's description, volume and dogma attributes for Item Detail: the
 * baked `typeInfo` shard first (issue #3882), so any published item opens
 * offline. A type the shard doesn't carry (unpublished, or newer than the
 * build) or a shard that won't load falls back to the cached ESI read — one
 * seen online before still renders offline. Null, never a rejection, when
 * neither has it.
 */
export async function loadItemDetailType(typeId: number): Promise<ItemDetailType | null> {
  const baked = await loadTypeInfo(typeId).catch(() => null);
  if (baked) return fromTypeInfo(baked);
  const cached = await loadUniverseTypeOnce(typeId).catch(() => null);
  return cached?.data ?? null;
}
