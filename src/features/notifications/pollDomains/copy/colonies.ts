import type { PlanetaryNotificationFire, ExtractorExpiringFire } from '@/engine/notificationDiffs';
import { assertProjectionWording, type PushCopy } from '@/engine/projection';
import { type DomainCopy, simple, HOUR_MS } from './shared';

export interface PlanetNames {
  readonly planet?: string;
}

type ColonyFire = PlanetaryNotificationFire | ExtractorExpiringFire;

export const colonyCopy: DomainCopy<ColonyFire, PlanetNames> & {
  readonly push: PushCopy<ColonyFire, PlanetNames>;
} = {
  poll: (fire, character, names) => {
    const planet = names.planet ?? `#${fire.planetId}`;
    if (fire.eventId === 'planetaryExtractionDone') {
      return simple('planetaryExtractionDone', { character, planet });
    }
    return simple('planetaryExtractorExpiring', {
      character,
      planet,
      hours: Math.round(fire.thresholdMs / HOUR_MS),
    });
  },
  /**
   * Hedged, unlike the live path's "has stopped": a pilot who restarted the
   * programs in game before this fired never had an extraction stop at all.
   *
   * The **title** hedges too, which `structureFuelCopy.push` does not. A push
   * is often read as a single line on a lock screen, so the title is the
   * whole claim there — "Extraction done" over a colony still running is the
   * exact sentence this was reported for, and softening only the body leaves
   * the wrong half showing.
   */
  push: (fire, character, names) => {
    const planet = names.planet ?? `#${fire.planetId}`;
    if (fire.eventId === 'planetaryExtractionDone') {
      assertProjectionWording('planetaryExtractionDone', 'hedge');
      return {
        title: 'Extraction due to stop',
        body: `${character}'s extraction on ${planet} was due to stop.`,
      };
    }
    assertProjectionWording('planetaryExtractorExpiring', 'hedge');
    const hours = Math.round(fire.thresholdMs / HOUR_MS);
    return {
      title: 'Extractor due to expire',
      body: `${character}'s extractor on ${planet} was due to expire in under ${hours} hours.`,
    };
  },
};
