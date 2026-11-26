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
