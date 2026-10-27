import type { IncursionNearbyFire } from '@/engine/incursions/incursionAlert';
import i18n from '@/i18n';
import { incursionNearbyWording, type IncursionNames } from './nearbyWording';
import type { DomainCopy } from './shared';

export type { IncursionNames };

export const incursionNearbyCopy: DomainCopy<IncursionNearbyFire, IncursionNames> = {
  poll: (fire, _character, names) =>
    incursionNearbyWording((key, vars) => i18n.t(key, vars), fire, names),
  // The staging system: the alert opens Route Safety with it as the Stop.
  subjectOf: (fire) => fire.stagingSystemId,
};
