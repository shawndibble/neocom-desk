import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LedgerActionResult } from './ledgerActions';

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
