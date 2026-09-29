import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { PlanRow, SensitivityRow } from './planModel';

/**
 * Export columns for the PI plan's Chain table, in its order. The table's
 * "Make or buy" cell stacks two things — the role the chosen floor gives the
 * tier and what the hub says about it — so they export as two columns.
 * Figures raw; every "—" is blank.
 */
export function planChainCsvColumns(t: CsvTranslate): CsvColumn<PlanRow>[] {
  return [
    { header: t('piPlan.column.commodity'), value: (row) => row.name },
    { header: t('piPlan.column.tier'), value: (row) => t('piPlan.tierChip', { tier: row.tier }) },
    { header: t('piPlan.column.needPerHour'), value: (row) => row.unitsPerHour },
    { header: t('piPlan.column.pins'), value: (row) => row.factoryPins },
    { header: t('piPlan.column.unitPrice'), value: (row) => row.unitPrice },
    {
      header: t('piPlan.column.read'),
      value: (row) => (row.role === 'make' ? t('piPlan.roleMake') : t('piPlan.roleBuy')),
    },
    {
      header: t('piPlan.csvHubRead'),
      value: (row) =>
        row.read === null
          ? t('piPlan.readUnknown')
          : row.read === 'make'
            ? t('piPlan.readMake')
            : t('piPlan.readBuy'),
    },
    { header: t('piPlan.column.valueAdd'), value: (row) => row.valueAddPerHour },
  ];
}

/**
 * Export columns for the sensitivity grid: the floor, its footprint as two
 * numbers (pins, and extractors on the P0 floor), then one margin column per
 * customs rate — raw ISK, blank where the grid says "Needs yield"/"No price".
 */
export function planSensitivityCsvColumns(
  t: CsvTranslate,
  rates: readonly number[],
  formatRate: (rate: number) => string
): CsvColumn<SensitivityRow>[] {
  return [
    { header: t('piPlan.floorColumn'), value: (row) => t(`piPlan.floorOption.${row.floor}`) },
    { header: t('piPlan.column.pins'), value: (row) => row.factoryPins },
    { header: t('piPlan.csvExtractors'), value: (row) => row.extractors },
    ...rates.map((rate, index): CsvColumn<SensitivityRow> => ({
      header: t('piPlan.rateColumn', { percent: formatRate(rate) }),
      value: (row) => {
        const cell = row.cells[index];
        return cell?.status === 'costed' ? cell.margin : null;
      },
    })),
  ];
}
