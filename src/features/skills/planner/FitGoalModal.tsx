/**
 * Fit goal picker (issue #3564): pick a saved Fitting and see when it
 * becomes flyable under this plan. A Fitting the plan doesn't cover yet
 * asks before adding its missing skills (prerequisites follow on their own).
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Button, Modal } from '@/components/ui';
import { focusRingClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { formatLocalDate } from '@/lib/localDate';
import { useTimeZone } from '@/lib/timeFormat';
import { isFitGoalPickable, type FitGoalOption } from './fitGoalOptions';

interface FitGoalModalProps {
  open: boolean;
  options: readonly FitGoalOption[];
  onClose: () => void;
  /** Called with the picked Fitting; the caller adds `toAdd` skills first when present. */
  onPick: (option: FitGoalOption) => void;
}

function stateText(option: FitGoalOption, t: TFunction, timeZone?: 'UTC'): string {
  switch (option.state) {
    case 'loading':
      return t('plans.fitGoal.loading');
    case 'unknown':
      return t('plans.fitGoal.unknown');
    case 'flyable-now':
      return t('plans.fitGoal.flyableNow');
    case 'on-date':
      return t('plans.fitGoal.flyableOn', { date: formatLocalDate(option.date, timeZone) });
    case 'missing':
      return t('plans.fitGoal.notByEnd', { count: option.missingLevels });
  }
}

export function FitGoalModal({ open, options, onClose, onPick }: FitGoalModalProps) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const [confirming, setConfirming] = useState<FitGoalOption | null>(null);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setConfirming(null);
  }

  function pick(option: FitGoalOption) {
    onPick(option);
    onClose();
  }

  function choose(option: FitGoalOption) {
    if (option.state === 'missing') setConfirming(option);
    else pick(option);
  }

  return (
    <Modal open={open} onClose={onClose} title={t('plans.fitGoal.title')}>
      <div className="space-y-3 text-xs">
        {options.length === 0 ? (
          <p className="text-text-dim">{t('plans.fitGoal.empty')}</p>
        ) : (
          <ul className="space-y-1">
            {options.map((option) => (
              <li key={option.id}>
                <button
                  type="button"
                  disabled={!isFitGoalPickable(option)}
                  onClick={() => choose(option)}
                  className={cx(
                    'flex w-full items-center justify-between gap-3 rounded-xs px-2 py-1.5 text-left hover:bg-panel-2 disabled:cursor-default disabled:hover:bg-transparent',
                    focusRingClassName
                  )}
                >
                  <span className="truncate">{option.name}</span>
                  <span className="shrink-0 tabular-nums text-text-dim">
                    {stateText(option, t, timeZone)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {confirming?.state === 'missing' && (
          <div className="space-y-2 rounded-xs border border-border p-2">
            <p>
              {t('plans.fitGoal.confirm', {
                name: confirming.name,
                count: confirming.missingLevels,
              })}
            </p>
            <div className="flex gap-2">
              <Button variant="primary" size="sm" onClick={() => pick(confirming)}>
                {t('plans.fitGoal.confirmAdd')}
              </Button>
              <Button size="sm" onClick={() => setConfirming(null)}>
                {t('plans.milestone.cancel')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
