import type { EngineAsset } from './assetTree';

export type BlueprintKind = 'original' | 'copy';

export function assetBlueprintKind(
  asset: Pick<EngineAsset, 'type_id' | 'is_blueprint_copy'>,
  blueprintTypeIds: ReadonlySet<number> | null
): BlueprintKind | null {
  if (asset.is_blueprint_copy) return 'copy';
  if (blueprintTypeIds?.has(asset.type_id)) return 'original';
  return null;
}

export function mayBeBlueprintName(name: string): boolean {
  return / (Blueprint|Formula)$/.test(name);
}
