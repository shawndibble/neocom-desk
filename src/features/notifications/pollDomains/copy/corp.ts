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
  push: (fire, character, names) => {
    assertProjectionWording('corpIndustryJobReady', 'assert');
    return {
      title: 'Corp industry job ready for delivery',
      body: `${character}: the corporation's ${names.item ?? `#${industryItemTypeId(fire)}`} job is ready for delivery.`,
    };
  },
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
  subjectOf: (fire) => (fire.eventId === 'corpMemberJoined' ? fire.memberCharacterId : undefined),
};

export const corpWalletCopy: DomainCopy<CorpWalletThresholdFire, NoNames> = {
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
