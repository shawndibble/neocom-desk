import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { BookRowView, ConflictCause } from '@/engine/corpTaxBook/personal';
import { formatIsk } from '@/lib/isk';
import type { CorpRowInfo } from './corpRows';

export type PillState =
  | 'pending'
  | 'billed'
  | 'conflict'
  | 'unattributed'
  | 'dismissed'
  | 'waived'
  | 'markedPaid'
  | 'sent'
  | 'oreWaived';

export const PILL_KEY: Record<PillState, string> = {
  pending: 'pending',
  billed: 'billed',
  conflict: 'conflict',
  unattributed: 'unattributed',
  dismissed: 'dismissed',
  waived: 'waived',
  markedPaid: 'markedPaid',
  sent: 'sent',
  oreWaived: 'oreWaived',
};

/**
 * A Conflict the member has already answered reads as what it now is — waiting on the corporation,
 * or answered by it — not as a warning they can do nothing more about (#6206). `rejected` is
 * deliberately absent: an officer who kept the bill has handed the day back, so it stays a
 * Conflict with the two ways out still on it.
 */
export function flaggedPillState(view: BookRowView): 'sent' | 'oreWaived' | undefined {
  if (view.state !== 'conflict') return undefined;
  if (view.flagged?.state === 'sent') return 'sent';
  if (view.flagged?.state === 'dismissed') return 'oreWaived';
  return undefined;
}

/** The conflict's resolution day, as the row prints it. */
export const resolvesOn = (iso: string | undefined) => (iso ? iso.slice(0, 10) : '');

export function useCorpStateLabel() {
  const { t } = useTranslation();
  return useCallback(
    (corp: CorpRowInfo): string =>
      corp.kind === 'label'
        ? t(`miningTax.corpBook.state.${PILL_KEY[corp.state]}`)
        : corp.view.bookOwed !== undefined
          ? t('miningTax.corpBook.state.markedPaid')
          : corp.view.state === 'paid'
            ? t('miningTax.status.paid')
            : t(
                `miningTax.corpBook.state.${
                  PILL_KEY[flaggedPillState(corp.view) ?? (corp.view.state as PillState)]
                }`
              ),
    [t]
  );
}

/** A Conflict's tooltip says why it clashes (`ConflictCause`). */
const CONFLICT_HINT_KEY: Record<ConflictCause, string> = {
  otherPayee: 'conflict',
  overListed: 'conflictOverListed',
  ownNeedsReview: 'conflictOwnNeedsReview',
  ownerCollected: 'conflictOwnerCollected',
};

/** Why the row reads as it does — a tooltip, never the only place it is said (§6c). */
export function useCorpStateHint() {
  const { t } = useTranslation();
  return useCallback(
    (corp: CorpRowInfo): string => {
      if (corp.kind === 'label') {
        return t(`miningTax.corpBook.hint.${PILL_KEY[corp.state]}`, { corp: corp.corpName });
      }
      const { view, corpName } = corp;
      // The member's mark is not the book's word: say what its Statement still shows (#6204).
      if (view.bookOwed !== undefined) {
        return t('miningTax.corpBook.hint.markedPaid', {
          corp: corpName,
          owed: formatIsk(view.bookOwed, 0),
        });
      }
      const flagged = flaggedPillState(view);
      const key =
        flagged ??
        (view.state === 'conflict' && view.conflictCause !== undefined
          ? CONFLICT_HINT_KEY[view.conflictCause]
          : view.state);
      return t(`miningTax.corpBook.hint.${key}`, {
        corp: corpName,
        date: resolvesOn(view.resolvesAt),
        reason: view.dismissalReason ?? '',
        sentOn: view.flagged?.at.slice(0, 10) ?? '',
        flagReason: view.flagged?.reason ?? '',
      });
    },
    [t]
  );
}
