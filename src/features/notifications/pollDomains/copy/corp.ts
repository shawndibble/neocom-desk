import type {
  CorpIndustryJobNotificationFire,
  CorpMemberJoinedFire,
  CorpMemberLeftFire,
  CorpWalletThresholdFire,
} from '@/engine/notificationDiffs';
import { assertProjectionWording, type PushCopy } from '@/engine/projection';
import { formatIsk } from '@/lib/isk';
import { industryItemTypeId, type ItemNames } from './industryJobs';
import { type DomainCopy, type NoNames, fired, simple } from './shared';

export const corpIndustryJobCopy: DomainCopy<CorpIndustryJobNotificationFire, ItemNames> & {
  readonly push: PushCopy<CorpIndustryJobNotificationFire, ItemNames>;
} = {
  poll: (fire, character, names) =>
    simple('corpIndustryJobReady', {
      character,
      item: names.item ?? `#${industryItemTypeId(fire)}`,
    }),
  // A started job's end_date is fixed, so the push asserts like the personal
  // job's. Written inline, not shared wording: the live and push text are the
  // same sentence, but this event's lives only in `notifications.fired.*`.
  push: (fire, character, names) => {
    assertProjectionWording('corpIndustryJobReady', 'assert');
    return {
      title: 'Corp industry job ready for delivery',
      body: `${character}: the corporation's ${names.item ?? `#${industryItemTypeId(fire)}`} job is ready for delivery.`,
    };
  },
  // Industry's Active Jobs lists corp jobs by installer (issue #2302), and
  // keeps the one an alert names whoever installed it.
  subjectOf: (fire) => fire.jobId,
};

export interface MemberNames {
  readonly member?: string;
}

export const corpRosterCopy: DomainCopy<CorpMemberJoinedFire | CorpMemberLeftFire, MemberNames> = {
  poll: (fire, character, names) =>
    simple(fire.eventId, {
      character,
      member: names.member ?? `#${fire.memberCharacterId}`,
    }),
  // The new member's roster row. Not `corpMemberLeft`: that member is gone
  // from the roster, so a highlight would name a row that is not there.
  subjectOf: (fire) => (fire.eventId === 'corpMemberJoined' ? fire.memberCharacterId : undefined),
};

export const corpWalletCopy: DomainCopy<CorpWalletThresholdFire, NoNames> = {
  // The division, not a row: `/corp/wallet` opens on it via `?division=`.
  subjectOf: (fire) => fire.division,
  poll: (fire, character) => ({
    title: fired('corpWalletThreshold', 'title'),
    body:
      fire.kind === 'balanceBelow'
        ? fired('corpWalletThreshold', 'balanceBelowBody', {
            character,
            division: fire.division,
            balance: formatIsk(fire.balance, 2),
          })
        : fired('corpWalletThreshold', 'transactionAboveBody', {
            character,
            division: fire.division,
            amount: formatIsk(Math.abs(fire.amount), 2),
          }),
  }),
};
