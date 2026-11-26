import type { OwnedStockChange } from './ownedStockOffer';

export type OwnedStockBulkKind = 'all' | 'none';

export type OwnedStockBulkMessage =
  | { kind: 'useAllDone' | 'useNoneDone'; count: number }
  | { kind: 'useAllNothing' | 'useNoneNothing' };

export interface OwnedStockBulkConfirmation {
  message: OwnedStockBulkMessage;
  undo: { kind: 'owned'; changes: OwnedStockChange[] } | null;
}

export function ownedStockBulkConfirmation(
  kind: OwnedStockBulkKind,
  changes: readonly OwnedStockChange[]
): OwnedStockBulkConfirmation {
  if (changes.length === 0) {
    return { message: { kind: kind === 'all' ? 'useAllNothing' : 'useNoneNothing' }, undo: null };
  }
  return {
    message: { kind: kind === 'all' ? 'useAllDone' : 'useNoneDone', count: changes.length },
    undo: { kind: 'owned', changes: [...changes] },
  };
}
