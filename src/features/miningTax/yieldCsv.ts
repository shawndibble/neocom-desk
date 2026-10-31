import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { OreLineValuation } from '@/engine/miningTax/yieldValuation';
import type { MiningYieldRow } from './yieldSnapshot';
import { sumUnits } from './oreBreakdown';
import { sumVolume, volumeDisplayMode } from './volume';

/**
 * Export columns for the Mining Yield Overview table and the two tables in
 * its day detail modal. Every data column the table can offer, not just the
 * ColumnPicker's selection (the Market order book's precedent) — minus
 * Overview's `total`, which is the same figure as Raw sell value.
 *
 * A value the table shows as "—" (an unpriced line, a volume nothing in the
 * row had a known unit volume for) exports blank, never 0: a blank lets a
 * spreadsheet SUM() skip it, a zero would claim it was measured.
 */

export interface YieldOverviewCsvContext {
  showRefining: boolean;
  systemNames: ReadonlyMap<number, string>;
  /** A system's security status; absent where it could not be read. */
  systemSecurity: ReadonlyMap<number, number>;
  typeNames: ReadonlyMap<number, string>;
  typeVolumes: ReadonlyMap<number, number>;
}

function typeLabel(typeNames: ReadonlyMap<number, string>, typeId: number): string {
  return typeNames.get(typeId) ?? `#${typeId}`;
}

/** True when the row has ore lines and none carries a value for this side. */
function noLinePriced(row: MiningYieldRow, pick: (line: OreLineValuation) => number): boolean {
  const { lines } = row.valuation;
  return lines.length > 0 && lines.every((line) => pick(line) === 0);
}

export function yieldOverviewCsvColumns(
  t: CsvTranslate,
  { showRefining, systemNames, systemSecurity, typeNames, typeVolumes }: YieldOverviewCsvContext
): CsvColumn<MiningYieldRow>[] {
  const columns: (CsvColumn<MiningYieldRow> | false)[] = [
    { header: t('miningTax.dateColumn'), value: (row) => row.entry.date },
    {
      header: t('miningTax.characterColumn'),
      value: (row) => row.characterName,
    },
    {
      header: t('miningTax.systemColumn'),
      value: (row) => systemNames.get(row.entry.solarSystemId) ?? `#${row.entry.solarSystemId}`,
    },
    {
      header: t('miningTax.csvSecurity'),
      value: (row) => systemSecurity.get(row.entry.solarSystemId) ?? null,
    },
    {
      // Only the ores whose size is known add up: with any unknown this is a floor, and the next column names them.
      header: t('miningTax.overview.volumeColumn'),
      value: (row) => {
        const volume = sumVolume(
          row.entry.oreLines,
          (line) => line.typeId,
          (line) => line.quantity,
          typeVolumes
        );
        return volumeDisplayMode(volume).kind === 'unknown' ? null : volume.m3;
      },
    },
    {
      header: t('miningTax.csvVolumeUnknownFor'),
      value: (row) => {
        const { missingTypeIds } = sumVolume(
          row.entry.oreLines,
          (line) => line.typeId,
          (line) => line.quantity,
          typeVolumes
        );
        return missingTypeIds.length === 0
          ? null
          : [...new Set(missingTypeIds)].map((id) => typeLabel(typeNames, id)).join('; ');
      },
    },
    {
      // Nothing priced is blank, never a 0 that reads as worthless.
      header: t('miningTax.overview.rawSellValue'),
      value: (row) => (noLinePriced(row, (line) => line.rawValue) ? null : row.valuation.rawValue),
    },
    showRefining && {
      header: t('miningTax.overview.refineValue'),
      value: (row) =>
        noLinePriced(row, (line) => line.refineValue) ? null : row.valuation.refineValue,
    },
    {
      // Every ore with its units — the table's two-name summary drops the rest.
      header: t('miningTax.overview.oreBreakdownColumn'),
      value: (row) =>
        [...row.entry.oreLines]
          .sort((a, b) => b.quantity - a.quantity)
          .map((line) => `${typeLabel(typeNames, line.typeId)} ${line.quantity}`)
          .join('; ') || null,
    },
    {
      header: t('miningTax.overview.unitsColumn'),
      value: (row) => sumUnits(row.entry.oreLines),
    },
    {
      header: t('miningTax.overview.pricingColumn'),
      value: (row) =>
        t(`miningTax.overview.${row.valuation.pricedAll ? 'pricingFull' : 'pricingPartial'}`),
    },
  ];
  return columns.filter((c): c is CsvColumn<MiningYieldRow> => c !== false);
}

/** A line with whole batches, left-over units or outputs has reprocessing data; none of them means there was nothing to refine. */
function hasReprocessing(line: OreLineValuation): boolean {
  return line.batches > 0 || line.unitsLeftOver > 0 || line.refineOutputs.length > 0;
}

/** The detail modal's "Ore mined" table. */
export function yieldOreCsvColumns(
  t: CsvTranslate,
  typeNames: ReadonlyMap<number, string>,
  typeVolumes: ReadonlyMap<number, number>,
  showRefining: boolean
): CsvColumn<OreLineValuation>[] {
  const columns: CsvColumn<OreLineValuation>[] = [
    { header: t('miningTax.oreColumn'), value: (line) => typeLabel(typeNames, line.typeId) },
    { header: t('miningTax.overview.detail.unitsColumn'), value: (line) => line.quantity },
    {
      header: t('miningTax.overview.detail.m3Column'),
      value: (line) => {
        const unit = typeVolumes.get(line.typeId);
        return unit === undefined ? null : unit * line.quantity;
      },
    },
    {
      header: t('miningTax.overview.rawSellValue'),
      value: (line) => (line.rawValue > 0 ? line.rawValue : null),
    },
  ];
  if (showRefining) {
    columns.push({
      header: t('miningTax.overview.refineValue'),
      value: (line) => (line.refineValue > 0 ? line.refineValue : null),
    });
  }
  columns.push(
    {
      header: t('miningTax.overview.detail.batchesColumn'),
      value: (line) => (hasReprocessing(line) ? line.batches : null),
    },
    {
      // Units short of a whole batch refine into nothing; blank where the type has no reprocessing data at all.
      header: t('miningTax.overview.detail.leftOverColumn'),
      value: (line) => (hasReprocessing(line) ? line.unitsLeftOver : null),
    }
  );
  return columns;
}

/** One material the day refines into — the detail modal's "Refines into" row. */
export interface YieldRefinedRow {
  typeId: number;
  quantity: number;
  /** Null when the material had no price — never a zero standing in for "free". */
  value: number | null;
}

/** The detail modal's "Refines into" table. */
export function yieldRefinesCsvColumns(
  t: CsvTranslate,
  typeNames: ReadonlyMap<number, string>
): CsvColumn<YieldRefinedRow>[] {
  return [
    {
      header: t('miningTax.overview.detail.materialColumn'),
      value: (material) => typeLabel(typeNames, material.typeId),
    },
    {
      header: t('miningTax.overview.detail.unitsColumn'),
      value: (material) => material.quantity,
    },
    {
      header: t('miningTax.overview.detail.valueColumn'),
      value: (material) => material.value,
    },
  ];
}
