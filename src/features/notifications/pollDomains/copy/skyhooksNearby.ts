import type { SkyhookRaidableNearbyFire } from '@/engine/skyhooks/skyhookAlert';
import { formatCountdown } from '@/lib/duration';
import { type DomainCopy, fired } from './shared';

export interface SkyhookNames {
  readonly planet?: string;
  readonly system?: string;
}

/**
 * A planet's name already leads with its system ("60M-TG I"), so naming the
 * system again reads twice; an unresolved planet is a generic skyhook, not an id.
 */
function whereLabel(names: SkyhookNames, systemId: number): string {
  const system = names.system ?? `#${systemId}`;
  if (names.planet === undefined) {
    return fired('skyhookRaidableNearby', 'whereUnnamed', { system });
  }
  if (names.system !== undefined && names.planet.startsWith(`${names.system} `))
    return names.planet;
  return fired('skyhookRaidableNearby', 'whereNamed', { planet: names.planet, system });
}

export const skyhookRaidableNearbyCopy: DomainCopy<SkyhookRaidableNearbyFire, SkyhookNames> = {
  poll: (fire, _character, names) => {
    const now = Date.now();
    const open = fire.startMs <= now;
    const duration = formatCountdown(((open ? fire.endMs : fire.startMs) - now) / 1000);
    return {
      title: fired('skyhookRaidableNearby', 'title', { count: fire.jumps }),
      body: fired('skyhookRaidableNearby', 'body', {
        where: whereLabel(names, fire.systemId),
        window: fired('skyhookRaidableNearby', open ? 'windowOpen' : 'windowIn', { duration }),
        count: fire.jumps,
      }),
    };
  },
  // The system; the Overview link carries no param for it.
  subjectOf: (fire) => fire.systemId,
};
