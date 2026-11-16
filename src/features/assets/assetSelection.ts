/**
 * Pure Assets-tree multi-select helpers (issue #90): a `Set<item_id>` of
 * currently selected leaf items, and the tri-state a checkbox derives from
 * comparing a node's descendant ids against that set.
 */
import { assetStackValue, type EngineAsset } from '@/engine/assetTree';

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

/** Forces every id into the selection, regardless of current state — unlike `toggleSelection`, never deselects (issue #415's "Select all in view"). */
export function selectAll(selected: ReadonlySet<number>, ids: readonly number[]): Set<number> {
  const next = new Set(selected);
  for (const id of ids) next.add(id);
  return next;
}

/** One `Name xQty` line per distinct type, quantities summed — the multibuy/Appraisal paste format. */
export function quantityLinesForSelection(
  itemIds: readonly number[],
  assetsByItemId: ReadonlyMap<number, { type_id: number; quantity: number }>,
  typeNames: ReadonlyMap<number, string>
): string[] {
  const totals = new Map<number, number>();
  for (const id of itemIds) {
    const asset = assetsByItemId.get(id);
    if (!asset) continue;
    totals.set(asset.type_id, (totals.get(asset.type_id) ?? 0) + asset.quantity);
  }
  return [...totals].map(
    ([typeId, quantity]) => `${typeNames.get(typeId) ?? `Type #${typeId}`} x${quantity}`
  );
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

export interface SelectionTotals {
  isk: number;
  volume: number;
  /**
   * Selected stacks with no value: left out of `isk` and counted here. A
   * blueprint copy with no value is not counted: a copy is worth nothing by
   * design, not missing a price.
   */
  unpriced: number;
}

/**
 * The select-mode bar's totals (issue #6165). Sums exactly the selected ids,
 * each at the Value column's stack value and quantity × the m³ column's unit
 * volume. A cascaded ship or container never adds its own hull: its checkbox
 * selects its contents' ids, not its own, the same rule Appraise follows.
 */
export function selectionTotals(
  itemIds: Iterable<number>,
  assetsByItemId: ReadonlyMap<
    number,
    Pick<EngineAsset, 'item_id' | 'type_id' | 'quantity' | 'is_blueprint_copy'>
  >,
  priceByTypeId: ReadonlyMap<number, number>,
  itemValueByItemId: ReadonlyMap<number, number>,
  volumeByTypeId: ReadonlyMap<number, number>
): SelectionTotals {
  const totals: SelectionTotals = { isk: 0, volume: 0, unpriced: 0 };
  for (const id of itemIds) {
    const asset = assetsByItemId.get(id);
    if (!asset) continue;
    const value = assetStackValue(asset, priceByTypeId, itemValueByItemId);
    if (value > 0) totals.isk += value;
    else if (!asset.is_blueprint_copy) totals.unpriced += 1;
    totals.volume += asset.quantity * (volumeByTypeId.get(asset.type_id) ?? 0);
  }
  return totals;
}
