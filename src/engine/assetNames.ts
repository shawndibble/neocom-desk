/**
 * In-game item names (ships, containers, deployables, structures): which asset
 * ids ESI can name, and which returned names are real. Pure: no fetch/Dexie.
 */

/** In-game names by item id. */
export type AssetNameMap = Readonly<Record<number, string>>;

export const NO_ASSET_NAMES: AssetNameMap = {};

/** SDE categories whose assembled items carry a player-set name. */
const NAMEABLE_CATEGORY_IDS: ReadonlySet<number> = new Set([
  6, // Ship
  22, // Deployable
  65, // Structure
]);

/** SDE groups (inside the Celestial category) of the cargo, secure, audit-log and freight containers. */
const NAMEABLE_GROUP_IDS: ReadonlySet<number> = new Set([12, 340, 448, 649]);

/** Whether a type's SDE group/category can carry an in-game name; unknown means no. */
export function isNameableGroup(
  groupId: number | undefined,
  categoryId: number | undefined
): boolean {
  return (
    (groupId !== undefined && NAMEABLE_GROUP_IDS.has(groupId)) ||
    (categoryId !== undefined && NAMEABLE_CATEGORY_IDS.has(categoryId))
  );
}

/**
 * The item ids worth sending to ESI's names endpoint: assembled (singleton)
 * items of a nameable type. One bad id fails a whole batch, so filter first.
 */
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

/**
 * ESI answers an unnamed item with an empty name, `None`, or its own type
 * name. Those are not names: they are dropped so the row reads as today.
 */
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
