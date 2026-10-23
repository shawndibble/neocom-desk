import type { DataTableColumn } from '@/components/ui';
import { AchievementCell } from './AchievementLine';
import type { AchievementLookup } from './useCharacterAchievements';

/** The optional Title / Score column, shared by the Characters and Contacts tables. */
export function achievementColumn<Row>(
  t: (key: string) => string,
  characterIdOf: (row: Row) => number,
  achievements: AchievementLookup,
  stacks: boolean
): DataTableColumn<Row> {
  return {
    id: 'achievement',
    header: t('characters.column.achievement'),
    sortValue: (row) => achievements.scoreOf(characterIdOf(row)),
    render: (row) => (
      <AchievementCell parts={achievements.partsOf(characterIdOf(row))} stacks={stacks} />
    ),
  };
}
