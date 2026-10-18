import type { IncursionNearbyFire } from '@/engine/incursions/incursionAlert';
import i18n from '@/i18n';
import { type DomainCopy, fired } from './shared';

export interface IncursionNames {
  readonly constellation?: string;
  readonly system?: string;
}

export const incursionNearbyCopy: DomainCopy<IncursionNearbyFire, IncursionNames> = {
  poll: (fire, _character, names) => ({
    title: fired('incursionNearby', 'title', { count: fire.jumps }),
    body: fired('incursionNearby', 'body', {
      constellation:
        names.constellation ??
        i18n.t('travel.incursions.constellation', { id: fire.constellationId }),
      system: names.system ?? `#${fire.stagingSystemId}`,
      state: i18n.t(`travel.incursions.state.${fire.state}`),
      count: fire.jumps,
    }),
  }),
  // The staging system: the alert opens Route Safety with it as the Stop.
  subjectOf: (fire) => fire.stagingSystemId,
};
