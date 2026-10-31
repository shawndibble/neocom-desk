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
  { labels, assetNames, blueprintTypeIds }: CorpAssetItemCsvContext
): CsvColumn<ItemTableRow>[] {
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
    { header: t('corp.assets.column.group'), value: (r) => r.categoryName ?? '' },
    {
      header: t('corp.assets.csv.stacks'),
      value: (r) =>
        r.ledger.stacks
          .map((stack) => {
            const name = assetNames[stack.itemId];
            const state =
              stack.isSingleton === null
                ? ''
                : ` (${stack.isSingleton ? t('corp.assets.assembled') : t('corp.assets.packaged')})`;
            return `${name === undefined ? '' : `${name} · `}${stackPathText(stack, labels)} ×${stack.quantity}${state}`;
          })
          .join('; '),
    },
  ];
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
      value: (r) => (r.groupEmpty ? t('corp.assets.csv.yes') : t('corp.assets.csv.no')),
    },
  ];
}
