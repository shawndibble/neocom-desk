import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import { ownedBlueprintQuantity, type OwnedBlueprintRow } from './ownedBlueprints';

/**
 * Export columns for Build Opportunities' "All owned" view, in the table's
 * order. A BPO's runs are blank (unlimited, not a count); an unranked
 * blueprint's ISK/hour is blank, never "Unknown".
 */
export function ownedBlueprintsCsvColumns(
  t: CsvTranslate,
  locationLabel: (row: OwnedBlueprintRow) => string | null
): CsvColumn<OwnedBlueprintRow>[] {
  return [
    { header: t('industry.ownedBlueprintsBlueprint'), value: (row) => row.name },
    { header: t('industry.product'), value: (row) => row.catalogEntry?.productName ?? null },
    {
      header: t('industry.ownedBlueprintsActivityLabel'),
      value: (row) =>
        row.activity === null ? null : t(`industry.ownedBlueprintsActivity.${row.activity}`),
    },
    {
      header: t('industry.opportunitiesBlueprint'),
      value: (row) => (row.kind === 'bpo' ? t('industry.bpo') : t('industry.bpc')),
    },
    { header: t('industry.ownedBlueprintsMe'), value: (row) => row.blueprint.material_efficiency },
    { header: t('industry.ownedBlueprintsTe'), value: (row) => row.blueprint.time_efficiency },
    {
      header: t('industry.runs'),
      value: (row) => (row.kind === 'bpo' ? null : row.blueprint.runs),
    },
    { header: t('industry.quantity'), value: (row) => ownedBlueprintQuantity(row.blueprint) },
    { header: t('industry.ownedBlueprintsLocation'), value: locationLabel },
    {
      header: t('industry.ownedBlueprintsOwner'),
      value: (row) =>
        row.owner.kind === 'character' ? row.owner.name : t('industry.ownedBlueprintsCorporation'),
    },
    { header: t('industry.iskPerHour'), value: (row) => row.iskPerHour },
  ];
}
