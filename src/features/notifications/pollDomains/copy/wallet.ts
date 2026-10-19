import type { WalletNotificationFire } from '@/engine/notificationDiffs';
import { formatIsk } from '@/lib/isk';
import { type DomainCopy, type NoNames, fired } from './shared';

export const walletCopy: DomainCopy<WalletNotificationFire, NoNames> = {
  poll: (fire, character) => ({
    title: fired('walletBalanceChanged', 'title'),
    body:
      fire.amount === null
        ? fired('walletBalanceChanged', 'body', { character })
        : fired('walletBalanceChanged', 'bodyWithAmount', {
            character,
            amount: formatIsk(fire.amount, 2),
          }),
  }),
  // The journal line that moved the balance.
  subjectOf: (fire) => fire.journalEntryId,
};
