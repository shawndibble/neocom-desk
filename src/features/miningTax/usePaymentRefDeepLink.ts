import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { DisplayRow } from '@/features/miningTax/groupRows';
import {
  findRowForPaymentRef,
  PAYMENT_REF_PARAM,
  parsePaymentRefParam,
} from '@/features/miningTax/paymentDeepLink';

/**
 * The wallet journal's "Mining tax" link (`paymentDeepLink.ts`): opens the
 * detail of the row that transaction paid. Latched on mount and spent at
 * once, like `useHighlightParam`, so a reload or a later refresh can't
 * reopen the modal after the pilot closed it. Searches every row, not the
 * filtered ones: a Character or Payee filter must not hide the target.
 */
export function usePaymentRefDeepLink(
  hasData: boolean,
  allDisplayRows: readonly DisplayRow[],
  loading: boolean,
  openDetail: (row: DisplayRow) => void
) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [initialPaymentRef] = useState(() =>
    parsePaymentRefParam(searchParams.get(PAYMENT_REF_PARAM))
  );
  const pendingPaymentRef = useRef(initialPaymentRef);
  useEffect(() => {
    if (initialPaymentRef === null) return;
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.delete(PAYMENT_REF_PARAM);
        return params;
      },
      { replace: true }
    );
  }, [initialPaymentRef, setSearchParams]);
  // An effect rather than a render-phase write: the target now lives in the
  // dialogs store, which a render must not notify.
  useEffect(() => {
    if (pendingPaymentRef.current === null || !hasData) return;
    const target = findRowForPaymentRef(allDisplayRows, pendingPaymentRef.current);
    if (target) openDetail(target);
    // A miss on cached data may be a snapshot older than the link; wait for the fresh read.
    if (target || !loading) pendingPaymentRef.current = null;
  }, [hasData, allDisplayRows, loading, openDetail]);
}
