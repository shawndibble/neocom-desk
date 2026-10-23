import { useTranslation } from 'react-i18next';
import { cx } from '@/lib/cx';
import { formatCount } from '@/lib/formatCount';
import { achievementParts, type AchievementParts, type CharacterAchievement } from './achievement';
import { useCharacterAchievement, useCharacterTitleNames } from './useCharacterAchievements';

/** "1,240 points", or null for none. */
function usePoints(score: number | null): string | null {
  const { t } = useTranslation();
  return score === null
    ? null
    : t('characters.achievement.points', { count: score, points: formatCount(score) });
}

/** The full line as plain text, for the truncating line's `title`. */
function useLineText(parts: AchievementParts): string {
  const { t } = useTranslation();
  const points = usePoints(parts.score);
  if (parts.title !== null && points !== null)
    return t('characters.achievement.line', { title: parts.title, points });
  return parts.title ?? points ?? '';
}

/**
 * "Title · 1,240 points" under a Character's corporation (issue #4777): Show
 * info, the Characters card, the Overview header. Nothing at all for a score
 * of 0 and no title.
 */
export function AchievementLine({
  achievement,
  className,
}: {
  achievement: CharacterAchievement | null;
  className?: string;
}) {
  const titleNames = useCharacterTitleNames(Boolean(achievement?.titleId));
  const parts = achievement && achievementParts(achievement, titleNames);
  if (!parts) return null;
  return <AchievementLineText parts={parts} className={className} />;
}

function AchievementLineText({
  parts,
  className,
}: {
  parts: AchievementParts;
  className?: string;
}) {
  const points = usePoints(parts.score);
  const text = useLineText(parts);
  return (
    <span className={cx('block truncate text-xs text-text-dim', className)} title={text}>
      {parts.title !== null && <b className="font-medium text-text">{parts.title}</b>}
      {parts.title !== null && points !== null && ' · '}
      {points}
    </span>
  );
}

/** `AchievementLine` for a Character it reads itself (a card, a header). */
export function CharacterAchievementLine({
  characterId,
  className,
}: {
  characterId: number | undefined;
  className?: string;
}) {
  const achievement = useCharacterAchievement(characterId);
  return <AchievementLine achievement={achievement} className={className} />;
}

/**
 * The Title / Score column's cell: title over points. `stacks` is a table whose
 * phone rows fold into one meta line (Contacts, Corp / Alliance's shape); the
 * Characters table scrolls sideways instead, so its cell keeps two lines.
 */
export function AchievementCell({
  achievement,
  titleNames,
  stacks = false,
}: {
  achievement: CharacterAchievement | null | undefined;
  titleNames: Readonly<Record<string, string>> | null;
  stacks?: boolean;
}) {
  const parts = achievement ? achievementParts(achievement, titleNames) : null;
  const points = usePoints(parts?.score ?? null);
  if (!parts) return <span data-dense-omit="true">—</span>;
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
