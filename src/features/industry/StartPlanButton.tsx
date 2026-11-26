import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, IconButton } from '@/components/ui';
import { startPlanOnce } from './rowStartPlan';
import * as Icon from '@/components/ui/icons';

interface StartPlanButtonProps {
  onStart: () => Promise<boolean>;
  compact?: { name: string };
  planKey?: unknown;
}

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
