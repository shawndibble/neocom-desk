import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { DisplayRow } from '@/features/miningTax/groupRows';
import { findRowForEntry, PAYMENT_ENTRY_PARAM } from '@/features/miningTax/paymentDeepLink';

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
  useEffect(() => {
    if (pendingEntryId.current === null || !hasData) return;
    const target = findRowForEntry(allDisplayRows, pendingEntryId.current);
    if (target) openDetail(target);
    if (target || !loading) pendingEntryId.current = null;
  }, [hasData, allDisplayRows, loading, openDetail]);
}
