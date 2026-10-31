/**
 * Export columns for the Corp assets ledger's two tables: every column the
 * table can offer, plus what the screen keeps in the expanded row (stacks) or
 * the group header (location totals).
 *
 * By item stays one row per type, so Quantity, Value and Volume still add up;
 * Stacks lists every stack with its path, quantity and state, and a type with
 * more stacks than one workbook cell holds continues in "Stacks (2)", ….
 */
import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import { exportFlag } from '@/lib/exportFlag';
import { joined } from '@/lib/exportSheets';
import { MAX_CELL_TEXT } from '@/lib/exportCells';
import type { AssetNameMap } from '@/engine/assetNames';
import { assetBlueprintKind } from '@/engine/blueprintKind';
import {
  placementLabels,
  stackPathText,
  type LedgerLabels,
  type LocationRow,
} from './assetLedgerView';
import type { ItemTableRow } from './CorpAssetItemTable';

export interface CorpAssetItemCsvContext {
  labels: LedgerLabels;
  /** In-game names by item id, shown first on the stack that has one. */
  assetNames: AssetNameMap;
  /** The SDE blueprint typeIDs, to tell an original from an ordinary item; null while unknown. */
  blueprintTypeIds: ReadonlySet<number> | null;
}

export function corpAssetItemCsvColumns(
  t: CsvTranslate,
  { labels, assetNames, blueprintTypeIds }: CorpAssetItemCsvContext,
  /** The rows exported: a type with more stacks than one cell holds spills into "Stacks (2)", … */
  rows: readonly ItemTableRow[] = []
): CsvColumn<ItemTableRow>[] {
  // One build per row, shared by the column count and every Stacks cell.
  const parts = new WeakMap<ItemTableRow, string[]>();
  const partsOf = (row: ItemTableRow): string[] => {
    let cached = parts.get(row);
    if (!cached) {
      cached = stackParts(row, t, labels, assetNames);
      parts.set(row, cached);
    }
    return cached;
  };
  const stackColumns = Math.max(1, ...rows.map((row) => partsOf(row).length));
  return [
    { header: t('corp.assets.column.item'), value: (r) => r.name },
    {
      header: t('corp.assets.csv.kind'),
      value: (r) => {
        const kind = assetBlueprintKind(
          { type_id: r.ledger.typeId, is_blueprint_copy: r.ledger.isBlueprintCopy },
          blueprintTypeIds
        );
        return kind ? t(`assets.blueprintBadge.${kind}.label`) : null;
      },
    },
    { header: t('corp.assets.column.quantity'), value: (r) => r.ledger.quantity },
    { header: t('corp.assets.column.target'), value: (r) => r.ledger.stock?.target ?? null },
    { header: t('corp.assets.column.shortBy'), value: (r) => r.ledger.stock?.shortBy ?? null },
    {
      header: t('corp.assets.csv.stockStatus'),
      value: (r) => (r.ledger.stock ? t(`corp.assets.csv.stock.${r.ledger.stock.status}`) : null),
    },
    {
      header: t('corp.assets.column.where'),
      value: (r) =>
        joined(
          placementLabels(r.ledger.placements, labels).map(
            (text, i) => `${text} ×${r.ledger.placements[i].quantity}`
          )
        ),
    },
    { header: t('corp.assets.column.value'), value: (r) => r.ledger.estimatedValue },
    { header: t('corp.assets.column.volume'), value: (r) => r.ledger.volume },
    { header: t('corp.assets.column.group'), value: (r) => r.categoryName ?? null },
    ...Array.from({ length: stackColumns }, (_, part) => ({
      header:
        part === 0
          ? t('corp.assets.csv.stacks')
          : t('corp.assets.csv.stacksMore', { part: part + 1 }),
      value: (r: ItemTableRow) => partsOf(r)[part] ?? null,
    })),
  ];
}

/** The row's stacks `; `-joined, cut between stacks into cells that fit a workbook cell. */
function stackParts(
  row: ItemTableRow,
  t: CsvTranslate,
  labels: LedgerLabels,
  assetNames: AssetNameMap
): string[] {
  const parts: string[] = [];
  let current = '';
  for (const stack of row.ledger.stacks) {
    const name = assetNames[stack.itemId];
    const state =
      stack.isSingleton === null
        ? ''
        : ` (${stack.isSingleton ? t('corp.assets.assembled') : t('corp.assets.packaged')})`;
    const text = `${name === undefined ? '' : `${name} · `}${stackPathText(stack, labels)} ×${stack.quantity}${state}`;
    if (current !== '' && current.length + 2 + text.length > MAX_CELL_TEXT) {
      parts.push(current);
      current = text;
    } else {
      current = current === '' ? text : joined([current, text]);
    }
  }
  if (current !== '') parts.push(current);
  return parts;
}

export function corpAssetLocationCsvColumns(
  t: CsvTranslate,
  labels: LedgerLabels
): CsvColumn<LocationRow>[] {
  return [
    { header: t('corp.assets.csv.place'), value: (r) => r.groupLabel },
    { header: t('corp.assets.column.place'), value: (r) => r.label },
    { header: t('corp.assets.column.items'), value: (r) => r.cell.itemCount },
    {
      header: t('corp.assets.column.largest'),
      value: (r) =>
        joined(r.cell.topStacks.map((s) => `${labels.typeName(s.typeId)} ×${s.quantity}`)),
    },
    { header: t('corp.assets.column.value'), value: (r) => r.cell.estimatedValue },
    { header: t('corp.assets.column.volume'), value: (r) => r.cell.volume },
    // The group header's facts, on every row of the group.
    { header: t('corp.assets.csv.groupItems'), value: (r) => r.groupItems },
    { header: t('corp.assets.csv.groupValue'), value: (r) => r.groupValue },
    { header: t('corp.assets.csv.divisionsInUse'), value: (r) => r.groupDivisionsInUse },
    {
      header: t('corp.assets.csv.emptyOffice'),
      value: (r) => exportFlag(t, r.groupEmpty),
    },
  ];
}
