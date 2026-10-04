import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { TFunction } from 'i18next';
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
import {
  ownedStockBulkConfirmation,
  type OwnedStockBulkKind,
  type OwnedStockBulkMessage,
} from '@/engine/industry/ownedStockBulkConfirmation';
import { useTimedToast } from '@/components/ui/useTimedToast';

/** The words for a "Use all" / "Use none" confirmation; the Materials table shows the same ones. */
export function ownedStockBulkText(t: TFunction, message: OwnedStockBulkMessage): string {
  switch (message.kind) {
    case 'useAllDone':
      return t('industry.useAllDone', { count: message.count });
    case 'useNoneDone':
      return t('industry.useNoneDone', { count: message.count });
    case 'useAllNothing':
      return t('industry.useAllNothing');
    case 'useNoneNothing':
      return t('industry.useNoneNothing');
  }
}

interface BulkToast {
  message: string;
  undo?: () => void;
}

interface OwnedStockBulkInput {
  /** The Group Owned Overlay's adapter. */
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
 * Undo writes the same changes reversed through the *latest* `write`. A
 * store's write can be built from what it last rendered (the Group Owned
 * Overlay copies its whole ledger), so the click-time one would drop any
 * edit made while the toast was up.
 */
export function useOwnedStockBulk({ write, ownedFor, scopedQuantityFor }: OwnedStockBulkInput): {
  fillAll: (rows: readonly OwnedStockOfferRow[]) => void;
  clearAll: (rows: readonly { typeID: number }[]) => void;
  toast: ReactNode;
} {
  const { t } = useTranslation();
  const [bulkToast, setBulkToast] = useState<BulkToast | null>(null);
  const latestWrite = useRef(write);
  useEffect(() => {
    latestWrite.current = write;
  });
  useTimedToast(bulkToast, () => setBulkToast(null));

  function apply(changes: readonly OwnedStockChange[], kind: OwnedStockBulkKind) {
    const { message, undo } = ownedStockBulkConfirmation(kind, changes);
    if (undo) write(changes);
    setBulkToast({
      message: ownedStockBulkText(t, message),
      undo: undo
        ? () => {
            latestWrite.current(undoOwnedStockChanges(undo.changes));
            setBulkToast(null);
          }
        : undefined,
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
