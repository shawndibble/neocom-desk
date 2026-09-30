/**
 * Loads what the Assets pages need to value their blueprint copies — the
 * Public Contract Offers snapshot plus the owner's blueprint records for
 * ME/TE/runs — and hands them to `engine/blueprintCopyValue.ts`.
 *
 * Best-effort throughout: no snapshot means every copy is worth 0, and an
 * unreadable blueprints endpoint (scope not granted, not a Director) means
 * each copy prices at the ME0/TE0 tier. Neither fails the page.
 */

import type { CharacterBlueprint } from '@/esi/endpoints';
import { blueprintCopyValues } from '@/engine/blueprintCopyValue';
import type { BpcContractRow } from '@/engine/contracts/bpcSearch';

/** The asset-row fields this needs: only rows ESI flags `is_blueprint_copy` are valued here. */
export interface CopyAssetRow {
  item_id: number;
  type_id: number;
  is_blueprint_copy?: boolean;
}

/** Blueprint records keyed by item_id, or null when they can't be read. */
export type LoadBlueprints = () => Promise<
  | readonly Pick<
      CharacterBlueprint,
      'item_id' | 'material_efficiency' | 'time_efficiency' | 'runs'
    >[]
  | null
>;

/**
 * Imported on demand: it pulls in Firestore, which a page without copies
 * never needs. BPOs ride along so the engine can tell a contract
 * selling a copy beside its original apart from one selling copies alone.
 */
async function loadCopyOffers(characterId: number): Promise<readonly BpcContractRow[]> {
  try {
    const { loadPublicBpcContracts } = await import('@/features/bpcContracts/syncedContracts');
    const snapshot = (await loadPublicBpcContracts(characterId))?.data;
    return snapshot ? [...snapshot.rows, ...(snapshot.originals ?? [])] : [];
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

/** Per-item value of every blueprint copy in `assets`; empty (and nothing loaded) when there are none. */
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
