import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { ComparisonRow } from '@/engine/skills/compareSkills';

export function skillCompareCsvColumns(
  t: CsvTranslate,
  characterIds: readonly number[],
  nameFor: (characterId: number) => string
): CsvColumn<ComparisonRow>[] {
  return [
    { header: t('skillCompare.skillColumn'), value: (row) => row.name },
    { header: t('skillCompare.groupColumn'), value: (row) => row.groupName },
    ...characterIds.map((characterId): CsvColumn<ComparisonRow> => ({
      header: nameFor(characterId),
      value: (row) => row.levels.get(characterId) ?? 0,
    })),
  ];
}
