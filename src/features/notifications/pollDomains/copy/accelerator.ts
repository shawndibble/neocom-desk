import type { AcceleratorExpiringFire } from '@/engine/notificationDiffs';
import { assertProjectionWording, type PushCopy } from '@/engine/projection';
import { type DomainCopy, type NoNames, fired, HOUR_MS } from './shared';

function hoursOf(thresholdMs: number): number {
  return Math.max(1, Math.round(thresholdMs / HOUR_MS));
}

export const acceleratorExpiringCopy: DomainCopy<AcceleratorExpiringFire, NoNames> & {
  readonly push: PushCopy<AcceleratorExpiringFire, NoNames>;
} = {
  poll: (fire, character) => ({
    title: fired('acceleratorExpiring', 'title'),
    body: fired('acceleratorExpiring', 'body', {
      character,
      count: hoursOf(fire.thresholdMs),
    }),
  }),
  /**
   * Hedged: the pilot can swap a fresh accelerator in game (and type it into
   * the Characters page) with the app closed, which falsifies the prediction
   * before the push fires (`engine/projection.ts`'s `projectionWording`).
   */
  push: (fire, character) => {
    assertProjectionWording('acceleratorExpiring', 'hedge');
    const hours = hoursOf(fire.thresholdMs);
    return {
      title: 'Accelerator due to run out',
      body: `${character}'s cerebral accelerator should run out in about ${hours} ${hours === 1 ? 'hour' : 'hours'}.`,
    };
  },
};
