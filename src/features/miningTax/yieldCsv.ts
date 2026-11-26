import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import { nothingPriced, type OreLineValuation } from '@/engine/miningTax/yieldValuation';
import type { MiningYieldRow } from './yieldSnapshot';
import { joined } from '@/lib/exportSheets';
import { oreLinesText, sumUnits } from './oreBreakdown';
import { sumVolume, volumeDisplayMode, type VolumeSum } from './volume';

export interface YieldOverviewCsvContext {
  showRefining: boolean;
  systemNames: ReadonlyMap<number, string>;
  systemSecurity: ReadonlyMap<number, number>;
  typeNames: ReadonlyMap<number, string>;
  typeVolumes: ReadonlyMap<number, number>;
}

function typeLabel(typeNames: ReadonlyMap<number, string>, typeId: number): string {
  return typeNames.get(typeId) ?? `#${typeId}`;
}

export function yieldOverviewCsvColumns(
  t: CsvTranslate,
  { showRefining, systemNames, systemSecurity, typeNames, typeVolumes }: YieldOverviewCsvContext
): CsvColumn<MiningYieldRow>[] {
  const volumes = new WeakMap<MiningYieldRow, VolumeSum>();
  const volumeOf = (row: MiningYieldRow): VolumeSum => {
    let volume = volumes.get(row);
    if (!volume) {
      volume = sumVolume(
        row.entry.oreLines,
        (line) => line.typeId,
        (line) => line.quantity,
        typeVolumes
      );
      volumes.set(row, volume);
    }
    return volume;
  };
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
      header: t('miningTax.overview.volumeColumn'),
      value: (row) => {
        const volume = volumeOf(row);
        return volumeDisplayMode(volume).kind === 'unknown' ? null : volume.m3;
      },
    },
    {
      header: t('miningTax.csvVolumeUnknownFor'),
      value: (row) => {
        const { missingTypeIds } = volumeOf(row);
        return missingTypeIds.length === 0
          ? null
          : joined([...new Set(missingTypeIds)].map((id) => typeLabel(typeNames, id)));
      },
    },
    {
      header: t('miningTax.overview.rawSellValue'),
      value: (row) => (nothingPriced(row.valuation) ? null : row.valuation.rawValue),
    },
    showRefining && {
      header: t('miningTax.overview.refineValue'),
      value: (row) => (nothingPriced(row.valuation) ? null : row.valuation.refineValue),
    },
    {
      header: t('miningTax.csvUnpricedOres'),
      value: (row) => {
        const unpriced = row.valuation.lines.filter((line) => line.rawValue === 0);
        return unpriced.length === 0
          ? null
          : joined([...new Set(unpriced.map((line) => typeLabel(typeNames, line.typeId)))]);
      },
    },
    {
      header: t('miningTax.overview.oreBreakdownColumn'),
      value: (row) => oreLinesText(row.entry.oreLines, (id) => typeLabel(typeNames, id)),
    },
    {
      header: t('miningTax.overview.unitsColumn'),
      value: (row) => sumUnits(row.entry.oreLines),
    },
  ];
  return columns.filter((c): c is CsvColumn<MiningYieldRow> => c !== false);
}

function hasReprocessing(line: OreLineValuation): boolean {
  return line.batches > 0 || line.unitsLeftOver > 0 || line.refineOutputs.length > 0;
}

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
      header: t('miningTax.overview.detail.leftOverColumn'),
      value: (line) => (hasReprocessing(line) ? line.unitsLeftOver : null),
    }
  );
  return columns;
}

export interface YieldRefinedRow {
  typeId: number;
  quantity: number;
  value: number | null;
}

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
