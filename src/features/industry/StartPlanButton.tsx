import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';

interface StartPlanButtonProps {
  /**
   * Creates the plan and opens it. Resolves true once it has navigated to the
   * new plan; false (or a rejection) means nothing opened.
   */
  onStart: () => Promise<boolean>;
}

/**
 * "Start a plan" for an Opportunities row. Saving the plan and opening its
 * page takes a moment, and without a busy state the button looked like it
 * ignored the click and invited a second one (a second plan). It stays busy
 * after navigating, until the page it sits on unmounts; it only comes back
 * when no plan opened. The pending state is the button's own, so a click
 * re-renders this button rather than the whole Opportunities tab.
 */
export function StartPlanButton({ onStart }: StartPlanButtonProps) {
  const { t } = useTranslation();
  const [starting, setStarting] = useState(false);
  return (
    <Button
      size="sm"
      disabled={starting}
      aria-busy={starting}
      onClick={() => {
        setStarting(true);
        onStart().then(
          (navigated) => {
            if (!navigated) setStarting(false);
          },
          () => setStarting(false)
        );
      }}
    >
      {starting
        ? t('industry.marketOpportunitiesStartingPlan')
        : t('industry.marketOpportunitiesStartPlan')}
    </Button>
  );
}
