import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, IconButton } from '@/components/ui';
import { startPlanOnce } from './rowStartPlan';
import * as Icon from '@/components/ui/icons';

interface StartPlanButtonProps {
  /**
   * Creates the plan and opens it. Resolves true once it has navigated to the
   * new plan; false (or a rejection) means nothing opened.
   */
  onStart: () => Promise<boolean>;
  /**
   * An icon-only, borderless button at the row touch tier, for a phone card
   * that has no room for the labelled button. `name` is the blueprint the
   * accessible label names.
   */
  compact?: { name: string };
  /**
   * What is being planned, the same key the row click uses (`useRowStartPlan`),
   * so the button and the row can't both save a plan for it.
   */
  planKey?: unknown;
}

/**
 * "Plan" for an Opportunities row. Saving the plan and opening its
 * page takes a moment, and without a busy state the button looked like it
 * ignored the click and invited a second one (a second plan). It stays busy
 * after navigating, until the page it sits on unmounts; it only comes back
 * when no plan opened. The pending state is the button's own, so a click
 * re-renders this button rather than the whole Opportunities tab.
 */
export function StartPlanButton({ onStart, compact, planKey }: StartPlanButtonProps) {
  const { t } = useTranslation();
  const [starting, setStarting] = useState(false);
  const start = () => {
    setStarting(true);
    (planKey === undefined ? onStart() : startPlanOnce(planKey, onStart)).then(
      (navigated) => {
        if (!navigated) setStarting(false);
      },
      () => setStarting(false)
    );
  };
  if (compact) {
    return (
      <IconButton
        variant="plain"
        size="row"
        icon={<Icon.AddToPlan />}
        label={t('industry.startPlanFor', { name: compact.name })}
        busy={starting}
        onClick={start}
      />
    );
  }
  return (
    <Button size="sm" aria-disabled={starting || undefined} aria-busy={starting} onClick={start}>
      {starting
        ? t('industry.marketOpportunitiesStartingPlan')
        : t('industry.marketOpportunitiesStartPlan')}
    </Button>
  );
}
