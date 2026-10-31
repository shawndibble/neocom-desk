import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { AchievementLookup } from './useCharacterAchievements';

/**
 * The Title / Score column as two export columns (title text, score as a
 * number), shared by every table that shows `achievementColumn`. Blank until
 * the public record is read, and for a Character with neither.
 */
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
