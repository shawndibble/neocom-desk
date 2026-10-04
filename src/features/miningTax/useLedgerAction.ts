import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LedgerActionResult } from './ledgerActions';

/**
 * How every Mining Tax dialog runs a ledger action, so a failure reads the
 * same everywhere: `pending` while it writes; on success, `onDone`; when the
 * pilot's view was stale (`already-assigned`), `onStale` — by default the same
 * as done, since closing and reloading shows what exists; on any other
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
      onDone?: () => void,
      onStale?: () => void
    ): Promise<LedgerActionResult<T>> => {
      setPending(true);
      setError(null);
      try {
        const result = await action();
        if (result.ok) onDone?.();
        else if (result.reason === 'already-assigned') (onStale ?? onDone)?.();
        else setError(t('miningTax.saveFailed'));
        return result;
      } finally {
        setPending(false);
      }
    },
    [t]
  );

  return { pending, error, setError, run };
}
