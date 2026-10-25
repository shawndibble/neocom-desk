// The push payload for a nearby alert (issue #5122, ADR 0027). Pure. Like the EVE
// notification push (eveNotificationPush.ts) it carries the raw facts and a generic
// English title/body as the floor: this package has no SDE and no i18n catalog, so the
// service worker (`pushHandler.ts`) renders the app's own wording with the names it
// resolves, and falls back to this text when it cannot.

import type { PushMessage } from './eveNotificationPush.js';
import type { KeyedNearbyFire } from './nearbyAlerts.js';

const jumpsPhrase = (jumps: number) => `${jumps} jump${jumps === 1 ? '' : 's'}`;

export function buildNearbyPush(
  { fire, occurrenceKey }: KeyedNearbyFire,
  nowMs: number
): PushMessage {
  const common = {
    characterId: String(fire.characterId),
    eventId: fire.eventId,
    occurrenceKey,
    fireAt: String(nowMs),
    jumps: String(fire.jumps),
  };
  if (fire.eventId === 'incursionNearby') {
    return {
      data: {
        ...common,
        title: `Incursion ${jumpsPhrase(fire.jumps)} away`,
        body: `An Incursion is staging ${jumpsPhrase(fire.jumps)} from your current system.`,
        constellationId: String(fire.constellationId),
        stagingSystemId: String(fire.stagingSystemId),
        incursionState: fire.state,
      },
    };
  }
  return {
    data: {
      ...common,
      title: `Raidable skyhook ${jumpsPhrase(fire.jumps)} away`,
      body: `A skyhook ${jumpsPhrase(fire.jumps)} from your current system can be raided.`,
      systemId: String(fire.systemId),
      planetId: String(fire.planetId),
      windowStartMs: String(fire.startMs),
      windowEndMs: String(fire.endMs),
    },
  };
}
