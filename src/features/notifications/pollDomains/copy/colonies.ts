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
