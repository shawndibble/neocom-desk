import type { SpExtractionFire } from '@/engine/notificationDiffs';
import { type DomainCopy, type NoNames, simple } from './shared';

export const spExtractionCopy: DomainCopy<SpExtractionFire, NoNames> = {
  poll: (_fire, character) => simple('spExtractionReady', { character }),
};
