import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { CorpRowInfo } from './corpRows';

export type PillState =
  'pending' | 'billed' | 'sent-waiting' | 'conflict' | 'unattributed' | 'dismissed' | 'waived';

export const PILL_KEY: Record<PillState, string> = {
  pending: 'pending',
  billed: 'billed',
  'sent-waiting': 'sentWaiting',
  conflict: 'conflict',
  unattributed: 'unattributed',
  dismissed: 'dismissed',
  waived: 'waived',
};

/** The conflict's resolution day, as the row prints it. */
const resolvesOn = (iso: string | undefined) => (iso ? iso.slice(0, 10) : '');

export function useCorpStateLabel() {
  const { t } = useTranslation();
  return useCallback(
    (corp: CorpRowInfo): string =>
      corp.kind === 'label'
        ? t(`miningTax.corpBook.state.${PILL_KEY[corp.state]}`)
        : corp.view.state === 'paid'
          ? t('miningTax.status.paid')
          : t(`miningTax.corpBook.state.${PILL_KEY[corp.view.state as PillState]}`),
    [t]
  );
}

/** What the pill prints: the label, but a sent-waiting row's short form so it fits the column. */
export function useCorpPillText() {
  const { t } = useTranslation();
  const label = useCorpStateLabel();
  return useCallback(
    (corp: CorpRowInfo): string => {
      const state = corp.kind === 'label' ? corp.state : corp.view.state;
      return state === 'sent-waiting'
        ? t('miningTax.corpBook.state.sentWaitingShort')
        : label(corp);
    },
    [t, label]
  );
}

/** Why the row reads as it does — a tooltip, never the only place it is said (§6c). */
export function useCorpStateHint() {
  const { t } = useTranslation();
  return useCallback(
    (corp: CorpRowInfo): string => {
      if (corp.kind === 'label') {
        return t(`miningTax.corpBook.hint.${PILL_KEY[corp.state]}`, { corp: corp.corpName });
      }
      const { view, corpName } = corp;
      return t(
        `miningTax.corpBook.hint.${view.state === 'sent-waiting' ? 'sentWaiting' : view.state}`,
        {
          corp: corpName,
          date: resolvesOn(view.resolvesAt),
          reason: view.dismissalReason ?? '',
        }
      );
    },
    [t]
  );
}
