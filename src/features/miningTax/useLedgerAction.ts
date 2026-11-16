import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { HeldElsewhereError, LedgerActionResult } from './ledgerActions';

/**
 * How every Mining Tax dialog runs a ledger action, so a failure reads the
 * same everywhere: `pending` while it writes; on success, `onDone`; when the
 * pilot's view was stale (`already-assigned`), also `onDone`, since closing
 * and reloading shows what exists; when a Corp Tax Book Settle up hit ore
 * the ledger holds elsewhere (`held-elsewhere`), `error` names those entries
 * and the dialog stays open; on any other
 * failure, `error` holds the "nothing was changed" message and the dialog
 * stays open to retry. `run` also hands the result back for a caller with a
 * further step, and `setError` lets one say what that step failed at.
 */
export function useLedgerAction() {
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async <T>(
      action: () => Promise<LedgerActionResult<T>>,
      onDone?: () => void
    ): Promise<LedgerActionResult<T>> => {
      setPending(true);
      setError(null);
      try {
        const result = await action();
        if (result.ok || result.reason === 'already-assigned') onDone?.();
        else if (result.reason === 'held-elsewhere') {
          // By reason, not `instanceof`: dialog tests mock `./ledgerActions` wholesale.
          const rows = (result.cause as HeldElsewhereError).rows;
          const dates = [...new Set(rows.map((r) => r.date))].sort();
          setError(
            t('miningTax.corpBook.pay.heldElsewhere', {
              count: rows.length,
              dates: dates.join(', '),
            })
          );
        } else setError(t('miningTax.saveFailed'));
        return result;
      } finally {
        setPending(false);
      }
    },
    [t]
  );

  return { pending, error, setError, run };
}
