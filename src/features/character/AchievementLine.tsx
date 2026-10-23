import { useTranslation } from 'react-i18next';
import { HintText } from '@/components/ui/HintText';
import { formatCount } from '@/lib/formatCount';
import { EmptyCell } from './ContactCells';
import type { AchievementParts } from './achievement';
import { useCharacterAchievements } from './useCharacterAchievements';

/** "1,240 points", or null for none. */
function usePoints(score: number | null): string | null {
  const { t } = useTranslation();
  return score === null
    ? null
    : t('characters.achievement.points', { count: score, points: formatCount(score) });
}

/** "Title · 1,240 points" under a Character's corporation (issue #4777). */
export function AchievementLine({ parts }: { parts: AchievementParts | null | undefined }) {
  const { t } = useTranslation();
  const points = usePoints(parts?.score ?? null);
  if (!parts) return null;
  const text =
    parts.title !== null && points !== null
      ? t('characters.achievement.line', { title: parts.title, points })
      : (parts.title ?? points);
  return (
    <span className="block truncate text-xs text-text-dim">
      <HintText content={text} onlyWhenTruncated>
        {parts.title !== null && <b className="font-medium text-text">{parts.title}</b>}
        {parts.title !== null && points !== null && ' · '}
        {points}
      </HintText>
    </span>
  );
}

/** `AchievementLine` for one Character it reads itself (the overview header). */
export function CharacterAchievementLine({ characterId }: { characterId: number }) {
  const achievements = useCharacterAchievements([characterId]);
  return <AchievementLine parts={achievements.partsOf(characterId)} />;
}

/**
 * The Title / Score column's cell: title over points. `stacks` is a table whose
 * phone rows fold into one meta line (Contacts, Corp / Alliance's shape); the
 * Characters table scrolls sideways instead, so its cell keeps two lines.
 */
export function AchievementCell({
  parts,
  stacks,
}: {
  parts: AchievementParts | null | undefined;
  stacks: boolean;
}) {
  const points = usePoints(parts?.score ?? null);
  if (!parts) return <EmptyCell />;
  return (
    <span
      className={
        stacks ? 'inline min-w-0 sm:flex sm:flex-col sm:items-start' : 'flex flex-col items-start'
      }
    >
      {parts.title !== null && <span className="truncate">{parts.title}</span>}
      {parts.title !== null && points !== null && stacks && (
        <span aria-hidden className="sm:hidden">
          {' · '}
        </span>
      )}
      {points !== null && <span className="text-text-dim tabular-nums">{points}</span>}
    </span>
  );
}
