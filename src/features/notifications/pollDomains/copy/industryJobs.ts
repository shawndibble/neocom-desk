import type { IndustryJobNotificationFire } from '@/engine/notificationDiffs';
import { renderSharedWording } from '@/engine/notificationWording';
import { assertProjectionWording, type PushCopy } from '@/engine/projection';
import { type DomainCopy, simple } from './shared';

export interface ItemNames {
  readonly item?: string;
}

/** Product where the job has one, else the blueprint itself (copying, research). */
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
  // The job sits in Active Jobs until it is delivered, which is the point.
  subjectOf: (fire) => fire.jobId,
};
