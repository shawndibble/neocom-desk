/**
 * Export columns for the Corp assets ledger's two tables. Every column the
 * table can offer, whatever the picker hides, plus the facts the screen keeps
 * in the expanded row (the by-item view's stacks) or the group header (the
 * by-location view's totals).
 *
 * The by-item file stays one row per item type, so its Quantity, Value and
 * Volume still add up to the corporation's holdings. Its Stacks column lists
 * every stack of that type (the screen caps the expanded list at 100) with its
 * full path, quantity and assembled/packaged state — nothing the expand rows
 * show is lost, and nothing is counted twice.
 */
import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import { exportFlag } from '@/lib/exportFlag';
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
  const stackColumns = Math.max(
    1,
    ...rows.map((row) => stackParts(row, t, labels, assetNames).length)
  );
  return [
    { header: t('corp.assets.column.item'), value: (r) => r.name },
    {
      // BPO and BPC both, not only the copy.
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
        placementLabels(r.ledger.placements, labels)
          .map((text, i) => `${text} ×${r.ledger.placements[i].quantity}`)
          .join('; '),
    },
    { header: t('corp.assets.column.value'), value: (r) => r.ledger.estimatedValue },
    { header: t('corp.assets.column.volume'), value: (r) => r.ledger.volume },
    { header: t('corp.assets.column.group'), value: (r) => r.categoryName ?? null },
    ...Array.from({ length: stackColumns }, (_, part) => ({
      header:
        part === 0
          ? t('corp.assets.csv.stacks')
          : t('corp.assets.csv.stacksMore', { part: part + 1 }),
      value: (r: ItemTableRow) => stackParts(r, t, labels, assetNames)[part] ?? null,
    })),
  ];
}

/** An .xlsx cell holds 32,767 characters; stay under it with room for the join. */
const MAX_STACK_CELL = 32_000;

function stackTexts(
  row: ItemTableRow,
  t: CsvTranslate,
  labels: LedgerLabels,
  assetNames: AssetNameMap
): string[] {
  return row.ledger.stacks.map((stack) => {
    const name = assetNames[stack.itemId];
    const state =
      stack.isSingleton === null
        ? ''
        : ` (${stack.isSingleton ? t('corp.assets.assembled') : t('corp.assets.packaged')})`;
    return `${name === undefined ? '' : `${name} · `}${stackPathText(stack, labels)} ×${stack.quantity}${state}`;
  });
}

/** The row's stacks, `; `-joined and cut between stacks into cells that fit a workbook cell. */
function stackParts(
  row: ItemTableRow,
  t: CsvTranslate,
  labels: LedgerLabels,
  assetNames: AssetNameMap
): string[] {
  const parts: string[] = [];
  let current = '';
  for (const text of stackTexts(row, t, labels, assetNames)) {
    if (current !== '' && current.length + 2 + text.length > MAX_STACK_CELL) {
      parts.push(current);
      current = text;
    } else {
      current = current === '' ? text : `${current}; ${text}`;
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
        r.cell.topStacks.map((s) => `${labels.typeName(s.typeId)} ×${s.quantity}`).join('; '),
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
