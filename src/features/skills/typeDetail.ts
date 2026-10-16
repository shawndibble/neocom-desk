/**
 * A type's description, dogma attributes and volume, read from the baked
 * typeInfo shards first (issues #3882, #3884) so it works offline for any
 * published type, including ones never fetched online. Every reader of only
 * those fields goes through here; a reader needing more of ESI's type
 * (`name`, `dogma_effects`, `packaged_volume`) stays on `loadUniverseType`.
 */
import type { UniverseType } from '@/esi/endpoints';
import type { Implants } from '@/engine/types';
import { loadTypeInfo } from '@/sde/loadTypeInfo';
import type { TypeInfoRecord } from '@/sde/typeInfoShard';
import { loadCharacterImplants, loadUniverseType, loadUniverseTypeOnce } from './data';
import { extractAttributeBonuses, sumAttributeBonuses } from './dogma';

/** The fields of ESI's `/universe/types/{id}` a baked record carries. */
export type TypeDetail = Pick<UniverseType, 'description' | 'volume' | 'dogma_attributes'>;

export interface LoadTypeDetailOptions {
  /** On the ESI fallback, retry a failed read once (`loadUniverseType`), for one-at-a-time callers. */
  retry?: boolean;
}

function fromTypeInfo(record: TypeInfoRecord): TypeDetail {
  return {
    description: record.description,
    ...(record.volume !== undefined && { volume: record.volume }),
    dogma_attributes: record.attributes.map(([attribute_id, value]) => ({ attribute_id, value })),
  };
}

/**
 * Baked typeInfo shard first; a type it lacks (unpublished, newer than the
 * build) or a shard that won't load falls back to cached ESI. Null, never a
 * rejection, when neither has it.
 */
export async function loadTypeDetail(
  typeId: number,
  { retry = false }: LoadTypeDetailOptions = {}
): Promise<TypeDetail | null> {
  const baked = await loadTypeInfo(typeId).catch(() => null);
  if (baked) return fromTypeInfo(baked);
  const load = retry ? loadUniverseType : loadUniverseTypeOnce;
  const cached = await load(typeId).catch(() => null);
  return cached?.data ?? null;
}

/** Summed attribute bonuses of these implant types; an unreadable type adds nothing. */
export async function loadImplantTypeBonuses(typeIds: readonly number[]): Promise<Implants> {
  const types = await Promise.all(typeIds.map((id) => loadTypeDetail(id, { retry: true })));
  return sumAttributeBonuses(types.map((type) => extractAttributeBonuses(type?.dogma_attributes)));
}

/**
 * Aggregate attribute bonuses across a character's fitted implants: implant
 * typeIDs (ESI or cache) -> per-type dogma attributes -> summed into one
 * Implants map (engine's computeSchedule/optimizer input). Returns `{}` when
 * there's no implant data cached or fetchable (offline first-load).
 */
export async function loadImplantBonuses(characterId: number): Promise<Implants> {
  const implants = await loadCharacterImplants(characterId);
  return loadImplantTypeBonuses(implants?.data ?? []);
}
