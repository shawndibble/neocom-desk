import { useTranslation } from 'react-i18next';

/**
 * "P2" — a planetary commodity's tier, as a quiet chip. The Plan tab's chain
 * table drew it inline; the Goal Planner draws it in four places, so it is
 * one component. Text, never colour alone: the tier is the label.
 */
export function TierChip({ tier }: { tier: number }) {
  const { t } = useTranslation();
  return (
    <span className="inline-flex shrink-0 items-center rounded-xs border border-line bg-panel-2 px-1.5 py-0.5 text-[0.6875rem] leading-none font-semibold tracking-widest text-text-dim uppercase">
      {t('piPlan.tierChip', { tier })}
    </span>
  );
}
