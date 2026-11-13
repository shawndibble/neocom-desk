import { useTranslation } from 'react-i18next';
import { Pill, type PillTone } from '@/components/ui/Pill';
import { Button, Caret, Tooltip } from '@/components/ui';
import { formatCountdown } from '@/lib/duration';
import { romanLevel } from '@/engine/projection';
import type { FitSkillVerdict, MissingSkill } from '@/engine/fittings/fitSkillVerdict';

const TONE: Record<FitSkillVerdict['kind'], PillTone> = {
  canFly: 'success',
  missing: 'warning',
  unknown: 'neutral',
};

/** "Gunnery V", or the type id when the skill catalog doesn't list it. */
const skillLine = ({ name, skillTypeID, targetLevel }: MissingSkill) =>
  `${name ?? `#${skillTypeID}`} ${romanLevel(targetLevel)}`;

/**
 * A Popular fits row's can-fly verdict as a tinted pill: §6c's computed-verdict
 * cue. "Missing N skills" names them on hover, or on tap under a finger.
 */
export function PopularFitVerdict({ verdict }: { verdict: FitSkillVerdict | undefined }) {
  const { t } = useTranslation();
  if (verdict === undefined) return null;
  const pill = (
    <Pill tone={TONE[verdict.kind]} className="shrink-0">
      <span data-testid="popular-fit-verdict">
        {verdict.kind === 'canFly'
          ? t('fittings.popular.verdict.canFly')
          : verdict.kind === 'missing'
            ? t('fittings.popular.verdict.missing', { count: verdict.skills.length })
            : t('fittings.popular.verdict.unknown')}
        {verdict.kind === 'missing' && verdict.omegaOnly && ` · ${t('fittings.alpha.omega')}`}
      </span>
    </Pill>
  );
  if (verdict.kind !== 'missing') return pill;
  const lines = verdict.skills.map(skillLine);
  return (
    <Tooltip content={lines.join('\n')} openOnTap>
      {/* The list reaches screen readers as the label; the bubble is for sight. */}
      <span
        role="img"
        aria-label={t('fittings.popular.verdict.missingNamed', {
          count: lines.length,
          skills: lines.join(', '),
        })}
        className="inline-flex shrink-0"
      >
        {pill}
      </span>
    </Tooltip>
  );
}

/**
 * A row's verdict where it can open: a warning button, "3 skills · 26d 10h"
 * behind §6c's leading caret (expands in place), listing the skills under the
 * row. Any other verdict is the plain pill, which never opens.
 */
export function FitVerdictControl({
  verdict,
  seconds,
  expanded,
  onToggle,
}: {
  verdict: FitSkillVerdict | undefined;
  /** Training left; absent until the skill schedule is read. */
  seconds: number | undefined;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  if (verdict?.kind !== 'missing') return <PopularFitVerdict verdict={verdict} />;
  const count = verdict.skills.length;
  return (
    <Button variant="warning" size="sm" aria-expanded={expanded} onClick={onToggle}>
      <Caret expanded={expanded} />
      <span data-testid="popular-fit-verdict">
        {seconds !== undefined
          ? t('fittings.popular.training', { count, time: formatCountdown(seconds) })
          : t('fittings.popular.verdict.missing', { count })}
        {verdict.omegaOnly && ` · ${t('fittings.alpha.omega')}`}
      </span>
    </Button>
  );
}
