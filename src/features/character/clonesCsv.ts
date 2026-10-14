import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { JumpClone } from '@/esi/endpoints';
import { cloneOwnName, type CloneNicknamesValue } from './cloneNicknames';

/**
 * Export columns for the jump-clone list. A card heads a named clone with its
 * name beside its location; the file splits them so each sorts on its own.
 * Implants are the names joined into one cell.
 */
export function clonesCsvColumns(
  t: CsvTranslate,
  {
    locationNames,
    implantNames,
    nicknames,
  }: {
    locationNames: ReadonlyMap<number, string>;
    implantNames: ReadonlyMap<number, string>;
    nicknames: CloneNicknamesValue;
  }
): CsvColumn<JumpClone>[] {
  return [
    { header: t('clones.csvName'), value: (clone) => cloneOwnName(clone, nicknames) },
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
