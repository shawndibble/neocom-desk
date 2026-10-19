import type { ContractNotificationFire } from '@/engine/notificationDiffs';
import { assertProjectionWording, type PushCopy } from '@/engine/projection';
import { formatIsk } from '@/lib/isk';
import { type DomainCopy, type NoNames, fired, simple, HOUR_MS } from './shared';

export const contractCopy: DomainCopy<ContractNotificationFire, NoNames> & {
  readonly push: PushCopy<ContractNotificationFire, NoNames>;
} = {
  // Same shape for the three transitions (issue #1091); the lead-time warning names its window (issue #1713).
  poll: (fire, character) => {
    const vars = { character, hours: Math.round((fire.thresholdMs ?? 0) / HOUR_MS) };
    // The wallet line the contract caused, folded in (`engine/walletCause.ts`).
    if (fire.walletChangeIsk !== undefined) {
      return {
        title: fired(fire.eventId, 'title'),
        body: fired(fire.eventId, 'bodyWithWallet', {
          ...vars,
          amount: formatIsk(fire.walletChangeIsk, 2),
        }),
      };
    }
    return simple(fire.eventId, vars);
  },
  /**
   * `courierDeliveryDue` and `contractExpiring` project, and both hedge:
   * delivering the haul or relisting the contract — the action the warning
   * exists to prompt — falsifies the prediction before the push fires (`engine/projection.ts`'s `projectionWording`).
   */
  push: (fire, character) => {
    const hours = Math.round((fire.thresholdMs ?? 0) / HOUR_MS);
    if (fire.eventId === 'contractExpiring') {
      assertProjectionWording('contractExpiring', 'hedge');
      return {
        title: 'Contract expiring',
        body: `${character}'s issued contract was due to expire in under ${hours} hours.`,
      };
    }
    assertProjectionWording('courierDeliveryDue', 'hedge');
    return {
      title: 'Courier delivery due',
      body: `${character}'s courier contract was due for delivery in under ${hours} hours.`,
    };
  },
  // The contract row. Still listed — the filter defaults to every status.
  subjectOf: (fire) => fire.contractId,
};
