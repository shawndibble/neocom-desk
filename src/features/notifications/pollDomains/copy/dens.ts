import type {
  MercenaryDenAnarchyFire,
  MercenaryDenReinforcedFire,
} from '@/engine/notificationDiffs';
import { assertProjectionWording, type PushCopy } from '@/engine/projection';
import type { PlanetNames } from './colonies';
import { type DomainCopy, fired, HOUR_MS } from './shared';

/** Hours as the lead window reads: whole hours, never "0". */
function hoursOf(thresholdMs: number): number {
  return Math.max(1, Math.round(thresholdMs / HOUR_MS));
}

export const mercenaryDenReinforcedCopy: DomainCopy<MercenaryDenReinforcedFire, PlanetNames> & {
  readonly push: PushCopy<MercenaryDenReinforcedFire, PlanetNames>;
} = {
  poll: (fire, character, names) => {
    const planet = names.planet ?? `#${fire.planetId}`;
    if (fire.phase === 'out') {
      return {
        title: fired('mercenaryDenReinforced', 'outTitle'),
        body: fired('mercenaryDenReinforced', 'outBody', { character, planet }),
      };
    }
    return {
      title: fired('mercenaryDenReinforced', 'soonTitle'),
      body: fired('mercenaryDenReinforced', 'soonBody', {
        character,
        planet,
        count: hoursOf(fire.thresholdMs),
      }),
    };
  },
  /**
   * Hedged, unlike the live path: a Projection is never re-checked, and a den
   * can leave reinforcement early, so the title carries the doubt too (a push
   * is often read as one lock-screen line).
   */
  push: (fire, character, names) => {
    assertProjectionWording('mercenaryDenReinforced', 'hedge');
    const planet = names.planet ?? `#${fire.planetId}`;
    if (fire.phase === 'out') {
      return {
        title: 'Den due out of reinforcement',
        body: `${character}'s Mercenary Den on ${planet} was due to come out of reinforcement now.`,
      };
    }
    return {
      title: 'Den due out of reinforcement soon',
      body: `${character}'s Mercenary Den on ${planet} was due to come out of reinforcement in about ${hoursOf(fire.thresholdMs)} hours.`,
    };
  },
};

export const mercenaryDenAnarchyCopy: DomainCopy<MercenaryDenAnarchyFire, PlanetNames> = {
  poll: (fire, character, names) => ({
    title: fired('mercenaryDenAnarchy', 'title'),
    body: fired('mercenaryDenAnarchy', 'body', {
      character,
      planet: names.planet ?? `#${fire.planetId}`,
      amount: Math.round(fire.anarchyAmount),
    }),
  }),
};
