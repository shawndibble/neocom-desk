// The push payload for a nearby alert (issue #5122, ADR 0028). Pure. Like every
// server-pushed event (issue #5121, serverEventPoll.ts) it carries the raw fire as
// JSON (`fire`) and a generic English title/body as the floor: this package has no
// SDE and no i18n catalog, so the service worker (`pushHandler.ts`) renders the app's
// own wording with the names it resolves, and falls back to this text when it cannot.

import type { PushMessage } from './eveNotificationPush.js';
import type { KeyedNearbyFire } from './nearbyAlerts.js';

const jumpsPhrase = (jumps: number) => `${jumps} jump${jumps === 1 ? '' : 's'}`;

export function buildNearbyPush(
  { fire, occurrenceKey }: KeyedNearbyFire,
  nowMs: number
): PushMessage {
  const jumps = jumpsPhrase(fire.jumps);
  const [title, body] =
    fire.eventId === 'incursionNearby'
      ? [`Incursion ${jumps} away`, `An Incursion is staging ${jumps} from your current system.`]
      : [
          `Raidable skyhook ${jumps} away`,
          `A skyhook ${jumps} from your current system can be raided.`,
        ];
  return {
    data: {
      characterId: String(fire.characterId),
      eventId: fire.eventId,
      occurrenceKey,
      fireAt: String(nowMs),
      title,
      body,
      fire: JSON.stringify(fire),
    },
  };
}
