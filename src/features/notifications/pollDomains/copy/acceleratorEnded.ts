import type { AcceleratorEndedFire } from '@/engine/notificationDiffs';
import { type DomainCopy, type NoNames, fired } from './shared';

export const acceleratorEndedCopy: DomainCopy<AcceleratorEndedFire, NoNames> = {
  poll: (fire, character) => ({
    title: fired('acceleratorEnded', `${fire.kind}.title`),
    body: fired('acceleratorEnded', `${fire.kind}.body`, { character, bonus: fire.bonus }),
  }),
};
