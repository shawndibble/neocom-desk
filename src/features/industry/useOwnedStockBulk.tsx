import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Toast } from '@/components/ui';
import {
  clearEveryOwned,
  takeEveryOffer,
  undoOwnedStockChanges,
  type OwnedQuantityFor,
  type OwnedStockChange,
  type OwnedStockOfferRow,
  type ScopedQuantityFor,
} from '@/engine/industry/ownedStockOffer';

/** How long the "Use all" / "Use none" confirmation stays up. */
const TOAST_MS = 8000;

interface BulkToast {
  message: string;
  undo?: () => void;
}

interface OwnedStockBulkInput {
  /** The store's adapter: plan sourcing or the Group Owned Overlay. */
  write: (changes: readonly OwnedStockChange[]) => void;
  ownedFor: OwnedQuantityFor;
  scopedQuantityFor: ScopedQuantityFor;
}

/**
 * "Use all" / "Use none" on a materials table, always answered: a toast
 * saying how many rows changed, with Undo, or that there was nothing to do.
 * A click that changed nothing would otherwise look like a dead button, and
 * "Use all" overwrites typed counts, so it needs a way back.
 *
 * Which rows change is the owned-stock offer's rule (`ownedStockOffer.ts`);
 * Undo writes the same changes reversed through `write`.
 */
export function useOwnedStockBulk({ write, ownedFor, scopedQuantityFor }: OwnedStockBulkInput): {
  fillAll: (rows: readonly OwnedStockOfferRow[]) => void;
  clearAll: (rows: readonly { typeID: number }[]) => void;
  toast: ReactNode;
} {
  const { t } = useTranslation();
  const [bulkToast, setBulkToast] = useState<BulkToast | null>(null);
  useEffect(() => {
    if (!bulkToast) return;
    const timer = setTimeout(() => setBulkToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [bulkToast]);

  function apply(changes: readonly OwnedStockChange[], kind: 'all' | 'none') {
    if (changes.length === 0) {
      setBulkToast({
        message: t(kind === 'all' ? 'industry.useAllNothing' : 'industry.useNoneNothing'),
      });
      return;
    }
    write(changes);
    setBulkToast({
      message: t(kind === 'all' ? 'industry.useAllDone' : 'industry.useNoneDone', {
        count: changes.length,
      }),
      undo: () => {
        write(undoOwnedStockChanges(changes));
        setBulkToast(null);
      },
    });
  }

  return {
    fillAll: (rows) => apply(takeEveryOffer(rows, ownedFor, scopedQuantityFor), 'all'),
    clearAll: (rows) => apply(clearEveryOwned(rows, ownedFor), 'none'),
    toast: bulkToast && (
      <Toast
        message={bulkToast.message}
        undo={bulkToast.undo && { label: t('industry.errands.undo'), onUndo: bulkToast.undo }}
      />
    ),
  };
}
