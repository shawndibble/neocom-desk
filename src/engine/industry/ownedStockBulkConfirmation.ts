import type { OwnedStockChange } from './ownedStockOffer';

export type OwnedStockBulkKind = 'all' | 'none';

export type OwnedStockBulkMessage =
  | { kind: 'useAllDone' | 'useNoneDone'; count: number }
  | { kind: 'useAllNothing' | 'useNoneNothing' };

export interface OwnedStockBulkConfirmation {
  message: OwnedStockBulkMessage;
  /** `null` when nothing changed, so there is nothing to put back. Undo reverses `changes`. */
  undo: { kind: 'owned'; changes: OwnedStockChange[] } | null;
}

/**
 * What a "Use all" / "Use none" click answers with: how many rows changed
 * plus the patch Undo reverses, or that there was nothing to do. Shared by
 * the Build Group hook and the Build Plan Materials edit session, which
 * differ in how they show and undo it but not in what it says.
 */
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
