import { useEffect, useRef, useState, type ReactNode } from 'react';
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
} from '@/engine/industry/ownedStockBulkConfirmation';
import { ownedStockBulkText } from './ownedStockBulkText';

interface BulkToast {
  message: string;
  undo?: () => void;
}

interface OwnedStockBulkInput {
  write: (changes: readonly OwnedStockChange[]) => void;
  ownedFor: OwnedQuantityFor;
  scopedQuantityFor: ScopedQuantityFor;
}

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
        instance={bulkToast}
        undo={bulkToast.undo && { label: t('industry.errands.undo'), onUndo: bulkToast.undo }}
        onClose={() => setBulkToast(null)}
      />
    ),
  };
}
