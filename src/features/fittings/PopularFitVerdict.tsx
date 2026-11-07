import { useTranslation } from 'react-i18next';
import type { FitSkillVerdict } from '@/engine/fittings/fitSkillVerdict';
import { cx } from '@/lib/cx';

const TONE: Record<FitSkillVerdict['kind'], string> = {
  canFly: 'text-success',
  missing: 'text-warning',
  unknown: 'text-text-dim',
};

/**
 * A Popular fit row's can-fly verdict for the active Character (#6011):
 * "● Can fly", "● Missing 3 skills · Omega only", or "● Skills unknown".
 * The word carries it; the dot is the glance cue. Nothing until known.
 */
export function PopularFitVerdict({ verdict }: { verdict: FitSkillVerdict | undefined }) {
  const { t } = useTranslation();
  if (verdict === undefined) return null;
  return (
    <span
      data-testid="popular-fit-verdict"
      className={cx('inline-flex shrink-0 items-center gap-1.5 text-xs', TONE[verdict.kind])}
    >
      <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-current" />
      {verdict.kind === 'canFly'
        ? t('fittings.popular.verdict.canFly')
        : verdict.kind === 'missing'
          ? t('fittings.popular.verdict.missing', { count: verdict.count })
          : t('fittings.popular.verdict.unknown')}
      {verdict.kind === 'missing' &&
        verdict.omegaOnly &&
        ` · ${t('fittings.popular.verdict.omegaOnly')}`}
    </span>
  );
}
