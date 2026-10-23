import type { SkyhookRaidableNearbyFire } from '@/engine/skyhooks/skyhookAlert';
import { formatCountdown } from '@/lib/duration';
import { type DomainCopy, fired } from './shared';

export interface SkyhookNames {
  readonly planet?: string;
  readonly system?: string;
}

export const skyhookRaidableNearbyCopy: DomainCopy<SkyhookRaidableNearbyFire, SkyhookNames> = {
  poll: (fire, _character, names) => {
    const now = Date.now();
    const open = fire.startMs <= now;
    const duration = formatCountdown(((open ? fire.endMs : fire.startMs) - now) / 1000);
    return {
      title: fired('skyhookRaidableNearby', 'title', { count: fire.jumps }),
      body: fired('skyhookRaidableNearby', 'body', {
        planet: names.planet ?? `#${fire.planetId}`,
        system: names.system ?? `#${fire.systemId}`,
        window: fired('skyhookRaidableNearby', open ? 'windowOpen' : 'windowIn', { duration }),
        count: fire.jumps,
      }),
    };
  },
  // The system; the Overview link carries no param for it.
  subjectOf: (fire) => fire.systemId,
};
