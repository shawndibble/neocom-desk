import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { OreLineValuation } from '@/engine/miningTax/yieldValuation';
import type { MiningYieldRow } from './yieldSnapshot';
import { oreBreakdownSummary, sumUnits } from './oreBreakdown';
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
  showCharacter: boolean;
  showRefining: boolean;
  systemNames: ReadonlyMap<number, string>;
  typeNames: ReadonlyMap<number, string>;
  typeVolumes: ReadonlyMap<number, number>;
}

function typeLabel(typeNames: ReadonlyMap<number, string>, typeId: number): string {
  return typeNames.get(typeId) ?? `#${typeId}`;
}

export function yieldOverviewCsvColumns(
  t: CsvTranslate,
  { showCharacter, showRefining, systemNames, typeNames, typeVolumes }: YieldOverviewCsvContext
): CsvColumn<MiningYieldRow>[] {
  const columns: (CsvColumn<MiningYieldRow> | false)[] = [
    { header: t('miningTax.dateColumn'), value: (row) => row.entry.date },
    showCharacter && {
      header: t('miningTax.characterColumn'),
      value: (row) => row.characterName,
    },
    {
      header: t('miningTax.systemColumn'),
      value: (row) => systemNames.get(row.entry.solarSystemId) ?? `#${row.entry.solarSystemId}`,
    },
    {
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
      header: t('miningTax.overview.rawSellValue'),
      value: (row) => row.valuation.rawValue,
    },
    showRefining && {
      header: t('miningTax.overview.refineValue'),
      value: (row) => row.valuation.refineValue,
    },
    {
      header: t('miningTax.overview.oreBreakdownColumn'),
      value: (row) => oreBreakdownSummary(row.entry.oreLines, typeNames),
    },
    {
      header: t('miningTax.overview.unitsColumn'),
      value: (row) => sumUnits(row.entry.oreLines),
    },
    {
      header: t('miningTax.overview.pricingColumn'),
      value: (row) => {
        const source = t(`miningTax.overview.priceSource.${row.priceSource}`);
        return row.valuation.pricedAll
          ? source
          : `${source} (${t('miningTax.overview.pricingPartial')})`;
      },
    },
  ];
  return columns.filter((c): c is CsvColumn<MiningYieldRow> => c !== false);
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
