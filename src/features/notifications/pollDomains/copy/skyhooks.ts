import type { SkyhookRaidableFire } from '@/engine/notificationDiffs';
import { assertProjectionWording, type PushCopy } from '@/engine/projection';
import type { PlanetNames } from './colonies';
import { type DomainCopy, fired, HOUR_MS } from './shared';

/** Hours as the lead time reads: whole hours, never "0". */
function hoursOf(thresholdMs: number): number {
  return Math.max(1, Math.round(thresholdMs / HOUR_MS));
}

export const skyhookRaidableCopy: DomainCopy<SkyhookRaidableFire, PlanetNames> & {
  readonly push: PushCopy<SkyhookRaidableFire, PlanetNames>;
} = {
  poll: (fire, _character, names) => {
    const planet = names.planet ?? `#${fire.planetId}`;
    if (fire.phase === 'soon') {
      return {
        title: fired('skyhookRaidable', 'soonTitle'),
        body: fired('skyhookRaidable', 'soonBody', { planet, count: hoursOf(fire.thresholdMs) }),
      };
    }
    return {
      title: fired('skyhookRaidable', 'nowTitle'),
      body: fired('skyhookRaidable', 'nowBody', { planet }),
    };
  },
  /**
   * Hedged, unlike the live path: a Projection is never re-checked, and a
   * reshuffled window or an emptied silo can falsify it before it lands.
   */
  push: (fire, _character, names) => {
    assertProjectionWording('skyhookRaidable', 'hedge');
    const planet = names.planet ?? `#${fire.planetId}`;
    if (fire.phase === 'soon') {
      return {
        title: 'Skyhook due to be raidable soon',
        body: `Your skyhook at ${planet} was due to become raidable in about ${hoursOf(fire.thresholdMs)} hours.`,
      };
    }
    return {
      title: 'Skyhook due to be raidable now',
      body: `Your skyhook at ${planet} was due to become raidable now.`,
    };
  },
};
