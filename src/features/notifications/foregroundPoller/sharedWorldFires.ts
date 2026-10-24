/**
 * One alert per world-scoped occurrence per poll. A raidable skyhook or an
 * Incursion is the world's, not a Character's, so two Characters in range of
 * it each diff the same fire (`occurrenceKey` carries no Character for them).
 * Delivered one after another, the second would raise a second toast whenever
 * the first never wrote a feed row to mark, and the shared row would flip
 * owner. So the poll keeps a single copy, before delivery.
 */
import { occurrenceKey } from '@/engine/occurrenceKey';
import { isEventEnabledFor } from '../eventSelection';
import type { AnyNotificationFire } from '../pollDomains';
import type { CharacterUpdate, LiveChannels } from './pollCharacter';

type SharedWorldFire = Extract<
  AnyNotificationFire,
  { eventId: 'skyhookRaidableNearby' | 'incursionNearby' }
>;

function isSharedWorld(fire: AnyNotificationFire): fire is SharedWorldFire {
  return fire.eventId === 'skyhookRaidableNearby' || fire.eventId === 'incursionNearby';
}

/**
 * Lower sorts first: a Character who will see it on a live channel, then the
 * nearest, then the lowest id (stable across polls).
 */
function rank(fire: SharedWorldFire, update: CharacterUpdate, channels: LiveChannels): number[] {
  const visible =
    (channels.browser && isEventEnabledFor(update.eventPrefs, fire.eventId, 'browser')) ||
    (channels.feed && isEventEnabledFor(update.eventPrefs, fire.eventId, 'feed'));
  return [visible ? 0 : 1, fire.jumps, fire.characterId];
}

function before(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
}

/** The updates with all but the best-ranked copy of each world-scoped occurrence removed. */
export function keepOneSharedFire(
  updates: readonly CharacterUpdate[],
  channels: LiveChannels
): CharacterUpdate[] {
  const best = new Map<string, { characterId: number; rank: number[] }>();
  for (const update of updates) {
    for (const fire of update.fires) {
      if (!isSharedWorld(fire)) continue;
      const key = occurrenceKey(fire, 0);
      const mine = rank(fire, update, channels);
      const held = best.get(key);
      if (held === undefined || before(mine, held.rank)) {
        best.set(key, { characterId: update.characterId, rank: mine });
      }
    }
  }
  return updates.map((update) => ({
    ...update,
    fires: update.fires.filter(
      (fire) =>
        !isSharedWorld(fire) || best.get(occurrenceKey(fire, 0))?.characterId === update.characterId
    ),
  }));
}
