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

export function selectAll(selected: ReadonlySet<number>, ids: readonly number[]): Set<number> {
  const next = new Set(selected);
  for (const id of ids) next.add(id);
  return next;
}

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
  unpriced: number;
}

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
