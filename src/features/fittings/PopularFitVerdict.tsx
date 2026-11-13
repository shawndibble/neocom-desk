import { useTranslation } from 'react-i18next';
import { Pill, type PillTone } from '@/components/ui/Pill';
import { Tooltip } from '@/components/ui';
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
