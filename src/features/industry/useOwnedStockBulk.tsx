import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Toast } from '@/components/ui';
import { undoOwnedStockChanges, type OwnedStockChange } from '@/engine/industry/ownedStockOffer';

/** How long the "Use all" / "Use none" confirmation stays up. */
const TOAST_MS = 8000;

interface BulkToast {
  message: string;
  undo?: () => void;
}

/**
 * "Use all" / "Use none", always answered: a toast saying how many rows
 * changed, with Undo, or that there was nothing to do. A click that changed
 * nothing — every row already holding what you own, or none of it detected —
 * would otherwise look like a dead button, and "Use all" overwrites typed
 * counts, so it needs a way back.
 *
 * `write` is the store's adapter (plan sourcing or the Group Owned Overlay);
 * Undo writes the same changes reversed through it. Returns the action and
 * the toast to render.
 */
export function useOwnedStockBulk(write: (changes: readonly OwnedStockChange[]) => void): {
  apply: (changes: readonly OwnedStockChange[], kind: 'all' | 'none') => void;
  toast: ReactNode;
} {
  const { t } = useTranslation();
  const [bulkToast, setBulkToast] = useState<BulkToast | null>(null);
  useEffect(() => {
    if (!bulkToast) return;
    const timer = setTimeout(() => setBulkToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [bulkToast]);

  const apply = useCallback(
    (changes: readonly OwnedStockChange[], kind: 'all' | 'none') => {
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
    },
    [write, t]
  );

  const toast = bulkToast && (
    <Toast
      message={bulkToast.message}
      undo={bulkToast.undo && { label: t('industry.errands.undo'), onUndo: bulkToast.undo }}
    />
  );
  return { apply, toast };
}
