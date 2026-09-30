/**
 * Whether an asset stack is a **BPO** or a **BPC** (CONTEXT.md), for the
 * Assets pages' blueprint badge.
 *
 * ESI flags a copy directly (`is_blueprint_copy`), so a copy is known from
 * the asset row alone. An original carries no flag at all — it is simply a
 * blueprint type that isn't flagged — so telling one apart from an ordinary
 * item takes the set of blueprint typeIDs (the SDE `blueprints.json` keys,
 * the same catalog Build Plan reads, so a BPO badge and a Build Plan menu
 * entry never disagree).
 */
import type { EngineAsset } from './assetTree';

export type BlueprintKind = 'original' | 'copy';

/**
 * `'copy'` for a flagged copy, `'original'` for an unflagged blueprint type,
 * null for anything else — and null for an unflagged asset while
 * `blueprintTypeIds` is still unknown, so a BPO badge never flashes in wrong.
 */
export function assetBlueprintKind(
  asset: Pick<EngineAsset, 'type_id' | 'is_blueprint_copy'>,
  blueprintTypeIds: ReadonlySet<number> | null
): BlueprintKind | null {
  if (asset.is_blueprint_copy) return 'copy';
  if (blueprintTypeIds?.has(asset.type_id)) return 'original';
  return null;
}

/**
 * Cheap pre-check before loading the blueprint set at all: every blueprint
 * and reaction formula type in the SDE is named "… Blueprint" or
 * "… Formula", so an asset list with no such name holds no blueprint and
 * the page need not fetch the catalog.
 */
export function mayBeBlueprintName(name: string): boolean {
  return / (Blueprint|Formula)$/.test(name);
}
