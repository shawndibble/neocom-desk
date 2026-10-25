import type { SkyhookRaidableNearbyFire } from '@/engine/skyhooks/skyhookAlert';
import i18n from '@/i18n';
import { skyhookRaidableNearbyWording, type SkyhookNames } from './nearbyWording';
import type { DomainCopy } from './shared';

export type { SkyhookNames };

export const skyhookRaidableNearbyCopy: DomainCopy<SkyhookRaidableNearbyFire, SkyhookNames> = {
  poll: (fire, _character, names) =>
    skyhookRaidableNearbyWording((key, vars) => i18n.t(key, vars), fire, names, Date.now()),
  // The system; the Overview link carries no param for it.
  subjectOf: (fire) => fire.systemId,
};
