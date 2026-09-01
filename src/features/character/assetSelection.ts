/**
 * Pure Assets-tree multi-select helpers (issue #90): a `Set<item_id>` of
 * currently selected leaf items, and the tri-state a checkbox derives from
 * comparing a node's descendant ids against that set.
 */

export type SelectionState = 'checked' | 'unchecked' | 'indeterminate';

export function selectionStateForIds(
  ids: readonly number[],
  selected: ReadonlySet<number>
): SelectionState {
  if (ids.length === 0) return 'unchecked';
  const selectedCount = ids.filter((id) => selected.has(id)).length;
  if (selectedCount === 0) return 'unchecked';
  return selectedCount === ids.length ? 'checked' : 'indeterminate';
}

/** Checking a node cascades to every descendant id at once — checked or indeterminate both fill in to fully selected; only a fully-checked node clears. */
export function toggleSelection(
  selected: ReadonlySet<number>,
  ids: readonly number[]
): Set<number> {
  const next = new Set(selected);
  const allSelected = ids.length > 0 && ids.every((id) => next.has(id));
  for (const id of ids) {
    if (allSelected) next.delete(id);
    else next.add(id);
  }
  return next;
}

export function namesForSelection(
  itemIds: readonly number[],
  assetsByItemId: ReadonlyMap<number, { type_id: number }>,
  typeNames: ReadonlyMap<number, string>
): string[] {
  return itemIds
    .map((id) => assetsByItemId.get(id))
    .filter((a): a is { type_id: number } => a !== undefined)
    .map((a) => typeNames.get(a.type_id) ?? `Type #${a.type_id}`);
}
