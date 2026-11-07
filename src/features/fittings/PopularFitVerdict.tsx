import { useTranslation } from 'react-i18next';
import { Pill, type PillTone } from '@/components/ui/Pill';
import type { FitSkillVerdict } from '@/engine/fittings/fitSkillVerdict';

const TONE: Record<FitSkillVerdict['kind'], PillTone> = {
  canFly: 'success',
  missing: 'warning',
  unknown: 'neutral',
};

/** A Popular fits row's can-fly verdict as a tinted pill: §6c's computed-verdict cue. */
export function PopularFitVerdict({ verdict }: { verdict: FitSkillVerdict | undefined }) {
  const { t } = useTranslation();
  if (verdict === undefined) return null;
  return (
    <Pill tone={TONE[verdict.kind]} className="shrink-0">
      <span data-testid="popular-fit-verdict">
        {verdict.kind === 'canFly'
          ? t('fittings.popular.verdict.canFly')
          : verdict.kind === 'missing'
            ? t('fittings.popular.verdict.missing', { count: verdict.count })
            : t('fittings.popular.verdict.unknown')}
        {verdict.kind === 'missing' && verdict.omegaOnly && ` · ${t('fittings.alpha.omega')}`}
      </span>
    </Pill>
  );
}
