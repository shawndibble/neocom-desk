import type { UniverseType } from '@/esi/endpoints';
import type { Implants } from '@/engine/types';
import { loadTypeInfo } from '@/sde/loadTypeInfo';
import type { TypeInfoRecord } from '@/sde/typeInfoShard';
import { loadCharacterImplants, loadUniverseType, loadUniverseTypeOnce } from './data';
import { extractAttributeBonuses, sumAttributeBonuses } from './dogma';

export type TypeDetail = Pick<
  UniverseType,
  'description' | 'volume' | 'packaged_volume' | 'dogma_attributes' | 'dogma_effects'
>;

export interface LoadTypeDetailOptions {
  retry?: boolean;
}

function fromTypeInfo(record: TypeInfoRecord): TypeDetail {
  return {
    description: record.description,
    ...(record.volume !== undefined && {
      volume: record.volume,
      packaged_volume: record.packagedVolume ?? record.volume,
    }),
    dogma_attributes: record.attributes.map(([attribute_id, value]) => ({ attribute_id, value })),
    dogma_effects: record.effects.map((effect_id) => ({
      effect_id,
      is_default: effect_id === record.defaultEffect,
    })),
  };
}

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

export async function loadImplantTypeBonuses(typeIds: readonly number[]): Promise<Implants> {
  const types = await Promise.all(typeIds.map((id) => loadTypeDetail(id, { retry: true })));
  return sumAttributeBonuses(types.map((type) => extractAttributeBonuses(type?.dogma_attributes)));
}

export async function loadImplantBonuses(characterId: number): Promise<Implants> {
  const implants = await loadCharacterImplants(characterId);
  return loadImplantTypeBonuses(implants?.data ?? []);
}
