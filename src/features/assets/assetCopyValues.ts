import type { CharacterBlueprint } from '@/esi/endpoints';
import { blueprintCopyValues } from '@/engine/blueprintCopyValue';
import type { BpcContractRow } from '@/engine/contracts/bpcSearch';

export interface CopyAssetRow {
  item_id: number;
  type_id: number;
  is_blueprint_copy?: boolean;
}

export type LoadBlueprints = () => Promise<
  | readonly Pick<
      CharacterBlueprint,
      'item_id' | 'material_efficiency' | 'time_efficiency' | 'runs'
    >[]
  | null
>;

async function loadCopyOffers(): Promise<readonly BpcContractRow[]> {
  try {
    const { loadBpcOfferRows } = await import('@/features/bpcContracts/bpcOfferRows');
    return (await loadBpcOfferRows()) ?? [];
  } catch {
    return [];
  }
}

async function safely<T>(load: () => Promise<T | null>): Promise<T | null> {
  try {
    return await load();
  } catch {
    return null;
  }
}

export async function loadAssetCopyValues(
  characterId: number,
  assets: readonly CopyAssetRow[],
  loadBlueprints: LoadBlueprints,
  loadOffers: (characterId: number) => Promise<readonly BpcContractRow[]> = loadCopyOffers
): Promise<Map<number, number>> {
  const copies = assets.filter((a) => a.is_blueprint_copy);
  if (copies.length === 0) return new Map();

  const [offers, blueprints] = await Promise.all([loadOffers(characterId), safely(loadBlueprints)]);
  const blueprintByItemId = new Map((blueprints ?? []).map((bp) => [bp.item_id, bp]));

  return blueprintCopyValues(
    copies.map((asset) => {
      const bp = blueprintByItemId.get(asset.item_id);
      return bp
        ? {
            itemId: asset.item_id,
            typeId: asset.type_id,
            me: bp.material_efficiency,
            te: bp.time_efficiency,
            runs: bp.runs,
          }
        : { itemId: asset.item_id, typeId: asset.type_id };
    }),
    offers
  );
}
