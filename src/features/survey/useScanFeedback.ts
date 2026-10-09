import { useCallback, useState } from 'react';
import type { AddScanResult } from './scanResult';

export function useScanFeedback<Extra extends unknown[]>(
  add: (text: string, ...extra: Extra) => Promise<AddScanResult>
) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AddScanResult | null>(null);
  const trackedAdd = useCallback(
    async (text: string, ...extra: Extra): Promise<AddScanResult> => {
      setBusy(true);
      setError(null);
      const result = await add(text, ...extra);
      setBusy(false);
      if (result !== 'ok') setError(result);
      return result;
    },
    [add]
  );
  return { trackedAdd, busy, error };
}
