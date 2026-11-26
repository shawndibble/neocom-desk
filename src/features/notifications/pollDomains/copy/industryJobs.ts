import type { IndustryJobNotificationFire } from '@/engine/notificationDiffs';
import { renderSharedWording } from '@/engine/notificationWording';
import { assertProjectionWording, type PushCopy } from '@/engine/projection';
import { type DomainCopy, simple } from './shared';

export interface ItemNames {
  readonly item?: string;
}

export function industryItemTypeId(fire: {
  productTypeId: number | null;
  blueprintTypeId: number;
}): number {
  return fire.productTypeId ?? fire.blueprintTypeId;
}

export const industryJobCopy: DomainCopy<IndustryJobNotificationFire, ItemNames> & {
  readonly push: PushCopy<IndustryJobNotificationFire, ItemNames>;
} = {
  poll: (fire, character, names) =>
    simple('industryJobComplete', {
      character,
      item: names.item ?? `#${industryItemTypeId(fire)}`,
    }),
  push: (fire, character, names) => {
    assertProjectionWording('industryJobComplete', 'assert');
    return renderSharedWording('industryJobComplete', {
      character,
      item: names.item ?? `#${industryItemTypeId(fire)}`,
    });
  },
  subjectOf: (fire) => fire.jobId,
};
