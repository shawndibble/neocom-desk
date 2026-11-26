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
