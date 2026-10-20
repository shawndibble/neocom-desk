import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Panel } from '@/components/ui';
import type { FeederViewSummary } from '../taxBook/feederViewClient';
import { isSettledAfterLeaving } from '../taxBook/feederViewModel';
import { addDays, isk, shortDate } from './moonsFormat';

/**
 * "Previously handled by <accounting corporation>" on a moon owner's Moons page
 * after it left (or was removed). While money is still owed it states the balance;
 * once settled it folds to one line, which stays until the officers dismiss it.
 */
export function HandledByCard({
  summary,
  name,
  canDismiss,
  onDismiss,
}: {
  summary: FeederViewSummary;
  name: string;
  canDismiss: boolean;
  onDismiss: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const settled = isSettledAfterLeaving(summary);
  const before = summary.leftAt
    ? shortDate(new Date(summary.leftAt).toISOString())
    : summary.coverageTo
      ? shortDate(addDays(summary.coverageTo, 1))
      : null;
  const dismiss = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await onDismiss();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  };
  const dismissButton = canDismiss && settled && (
    <Button variant="ghost" size="sm" loading={busy} onClick={() => void dismiss()}>
      {t('corpTaxBook.moons.ownerView.previous.dismiss')}
    </Button>
  );
  if (settled)
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xs border border-line bg-panel px-3 py-2 text-sm">
        <p>
          <span className="font-semibold">
            {t('corpTaxBook.moons.ownerView.previous.title', { name })}
          </span>{' '}
          <span className="text-text-dim">
            {t(
              before
                ? 'corpTaxBook.moons.ownerView.previous.settled'
                : 'corpTaxBook.moons.ownerView.previous.settledUndated',
              { date: before }
            )}
          </span>
        </p>
        {dismissButton}
        {failed && (
          <p role="alert" className="w-full text-xs text-danger">
            {t('corpTaxBook.moons.ownerView.previous.dismissFailed')}
          </p>
        )}
      </div>
    );
  return (
    <Panel>
      <div className="space-y-1 text-sm">
        <h2 className="font-semibold">
          {t('corpTaxBook.moons.ownerView.previous.title', { name })}
        </h2>
        <p>
          {t('corpTaxBook.moons.ownerView.previous.owes', { name })}{' '}
          <strong className="tabular-nums">{isk(summary.balanceIsk)}</strong>{' '}
          {t(
            before
              ? 'corpTaxBook.moons.ownerView.previous.owesFor'
              : 'corpTaxBook.moons.ownerView.previous.owesForUndated',
            { date: before }
          )}
        </p>
        {before && (
          <p className="text-xs text-text-dim">
            {t('corpTaxBook.moons.ownerView.previous.yours', { date: before })}
          </p>
        )}
      </div>
    </Panel>
  );
}
