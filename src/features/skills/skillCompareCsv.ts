import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { ComparisonRow } from '@/engine/skills/compareSkills';

/**
 * Export columns for the skill comparison: skill, group, then one level column
 * per compared character, headed by the character's name. Group is always
 * included — the on-screen view shows it as a band, and a spreadsheet can hide
 * a column itself.
 */
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
