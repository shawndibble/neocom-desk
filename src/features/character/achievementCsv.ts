import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { AchievementLookup } from './useCharacterAchievements';

export function achievementCsvColumns<Row>(
  t: CsvTranslate,
  characterIdOf: (row: Row) => number,
  achievements: AchievementLookup
): CsvColumn<Row>[] {
  return [
    {
      header: t('characters.csvAchievementTitle'),
      value: (row) => achievements.partsOf(characterIdOf(row))?.title,
    },
    {
      header: t('characters.csvAchievementScore'),
      value: (row) => achievements.partsOf(characterIdOf(row))?.score,
    },
  ];
}
