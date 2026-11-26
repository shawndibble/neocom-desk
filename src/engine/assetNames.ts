export type AssetNameMap = Readonly<Record<number, string>>;

export const NO_ASSET_NAMES: AssetNameMap = {};

const NAMEABLE_CATEGORY_IDS: ReadonlySet<number> = new Set([6, 22, 65]);

const NAMEABLE_GROUP_IDS: ReadonlySet<number> = new Set([12, 340, 448, 649]);

export function isNameableGroup(
  groupId: number | undefined,
  categoryId: number | undefined
): boolean {
  return (
    (groupId !== undefined && NAMEABLE_GROUP_IDS.has(groupId)) ||
    (categoryId !== undefined && NAMEABLE_CATEGORY_IDS.has(categoryId))
  );
}

export function nameableItemIds(
  assets: readonly { item_id: number; type_id: number; is_singleton: boolean }[],
  isNameableType: (typeId: number) => boolean
): number[] {
  const ids = new Set<number>();
  for (const asset of assets) {
    if (asset.is_singleton && isNameableType(asset.type_id)) ids.add(asset.item_id);
  }
  return [...ids];
}

export function realAssetNames(
  raw: readonly { item_id: number; name: string }[],
  typeIdByItemId: ReadonlyMap<number, number>,
  typeNameOf: (typeId: number) => string | undefined
): Record<number, string> {
  const names: Record<number, string> = {};
  for (const { item_id, name } of raw) {
    const typeId = typeIdByItemId.get(item_id);
    if (typeId === undefined) continue;
    const trimmed = name.trim();
    if (trimmed === '' || trimmed.toLowerCase() === 'none') continue;
    if (trimmed === typeNameOf(typeId)) continue;
    names[item_id] = trimmed;
  }
  return names;
}
