import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { BookRowView, ConflictCause } from '@/engine/corpTaxBook/personal';
import type { CorpRowInfo } from './corpRows';
import { answeredByMember, isoDay } from './memberFlag';

export type PillState =
  | 'pending'
  | 'billed'
  | 'estimate'
  | 'conflict'
  | 'unattributed'
  | 'dismissed'
  | 'waived'
  | 'sent'
  | 'oreWaived'
  | 'notPaying';

export const PILL_KEY: Record<PillState, string> = {
  pending: 'pending',
  billed: 'billed',
  estimate: 'estimate',
  conflict: 'conflict',
  unattributed: 'unattributed',
  dismissed: 'dismissed',
  waived: 'waived',
  sent: 'sent',
  oreWaived: 'oreWaived',
  notPaying: 'notPaying',
};

export function flaggedPillState(view: BookRowView): 'sent' | 'oreWaived' | undefined {
  if (view.state === 'billed' && view.flagged?.state === 'sent') return 'sent';
  if (view.state !== 'conflict' || !answeredByMember(view)) return undefined;
  return view.flagged?.state === 'sent' ? 'sent' : 'oreWaived';
}

export const resolvesOn = isoDay;

export function useCorpStateLabel() {
  const { t } = useTranslation();
  return useCallback(
    (corp: CorpRowInfo): string =>
      corp.kind === 'label'
        ? t(`miningTax.corpBook.state.${PILL_KEY[corp.state]}`)
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

const CONFLICT_HINT_KEY: Record<ConflictCause, string> = {
  otherPayee: 'conflict',
  ownNeedsReview: 'conflictOwnNeedsReview',
  ownerCollected: 'conflictOwnerCollected',
};

export function useCorpStateHint() {
  const { t } = useTranslation();
  return useCallback(
    (corp: CorpRowInfo): string => {
      if (corp.kind === 'label') {
        return t(`miningTax.corpBook.hint.${PILL_KEY[corp.state]}`, { corp: corp.corpName });
      }
      const { view, corpName } = corp;
      const flagged = flaggedPillState(view);
      const key =
        flagged ??
        (view.state === 'conflict' && view.conflictCause !== undefined
          ? CONFLICT_HINT_KEY[view.conflictCause]
          : view.state);
      return t(`miningTax.corpBook.hint.${key}`, {
        corp: corpName,
        date: resolvesOn(view.resolvesAt),
        day: view.date,
        reason: view.dismissalReason ?? '',
        sentOn: isoDay(view.flagged?.at),
        flagReason: view.flagged?.reason ?? '',
      });
    },
    [t]
  );
}
