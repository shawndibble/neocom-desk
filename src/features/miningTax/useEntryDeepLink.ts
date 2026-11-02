import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { DisplayRow } from '@/features/miningTax/groupRows';
import { findRowForEntry, PAYMENT_ENTRY_PARAM } from '@/features/miningTax/paymentDeepLink';

/**
 * The wallet journal's "Mining tax" entry link (`paymentDeepLink.ts`): opens
 * the detail of the entry a linked transaction paid. Latched on mount and spent at
 * once, like `useHighlightParam`, so a reload or a later refresh can't
 * reopen the modal after the pilot closed it. Searches every row, not the
 * filtered ones: a Character or Payee filter must not hide the target.
 */
export function useEntryDeepLink(
  hasData: boolean,
  allDisplayRows: readonly DisplayRow[],
  loading: boolean,
  openDetail: (row: DisplayRow) => void
) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [initialEntryId] = useState(() => searchParams.get(PAYMENT_ENTRY_PARAM) || null);
  const pendingEntryId = useRef(initialEntryId);
  useEffect(() => {
    if (initialEntryId === null) return;
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.delete(PAYMENT_ENTRY_PARAM);
        return params;
      },
      { replace: true }
    );
  }, [initialEntryId, setSearchParams]);
  // An effect rather than a render-phase write: the target now lives in the
  // dialogs store, which a render must not notify.
  useEffect(() => {
    if (pendingEntryId.current === null || !hasData) return;
    const target = findRowForEntry(allDisplayRows, pendingEntryId.current);
    if (target) openDetail(target);
    // A miss on cached data may be a snapshot older than the link; wait for the fresh read.
    if (target || !loading) pendingEntryId.current = null;
  }, [hasData, allDisplayRows, loading, openDetail]);
}
