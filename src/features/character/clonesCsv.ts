import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { JumpClone } from '@/esi/endpoints';

/**
 * Export columns for the jump-clone table. The table shows a named clone as
 * "name · location" in one cell; the file splits them so each sorts on its
 * own. Implants are the names joined into one cell, as the table lists them.
 */
export function clonesCsvColumns(
  t: CsvTranslate,
  {
    locationNames,
    implantNames,
  }: {
    locationNames: ReadonlyMap<number, string>;
    implantNames: ReadonlyMap<number, string>;
  }
): CsvColumn<JumpClone>[] {
  return [
    { header: t('clones.csvName'), value: (clone) => clone.name?.trim() || undefined },
    {
      header: t('clones.location'),
      value: (clone) =>
        locationNames.get(clone.location_id) ??
        t(clone.location_type === 'station' ? 'clones.stationLabel' : 'clones.structureLabel', {
          id: clone.location_id,
        }),
    },
    {
      header: t('clones.implants'),
      value: (clone) =>
        clone.implants.map((id) => implantNames.get(id) ?? `Type #${id}`).join('; '),
    },
  ];
}
