import { describe, expect, it } from 'vitest';
import type { AnyNotificationFire } from '../pollDomains';
import type { CharacterUpdate } from './pollCharacter';
import { keepOneSharedFire } from './sharedWorldFires';

const skyhook = (characterId: number, jumps: number): AnyNotificationFire => ({
  eventId: 'skyhookRaidableNearby',
  characterId,
  systemId: 30000144,
  planetId: 40000001,
  startMs: 1000,
  endMs: 2000,
  jumps,
});

const mail = (characterId: number): AnyNotificationFire => ({
  eventId: 'newMail',
  characterId,
  mailId: 5,
});

const update = (
  characterId: number,
  fires: AnyNotificationFire[],
  eventPrefs: CharacterUpdate['eventPrefs'] = {}
): CharacterUpdate =>
  ({ characterId, fires, eventPrefs, retractedKeys: [], snapshots: new Map() }) as never;

const BOTH = { browser: true, feed: true };
const keptBy = (updates: CharacterUpdate[]) =>
  updates
    .filter((u) => u.fires.some((f) => f.eventId === 'skyhookRaidableNearby'))
    .map((u) => u.characterId);

describe('keepOneSharedFire', () => {
  it('keeps one Character’s copy of a world-scoped fire, the nearest', () => {
    const out = keepOneSharedFire([update(1, [skyhook(1, 5)]), update(2, [skyhook(2, 2)])], BOTH);
    expect(keptBy(out)).toEqual([2]);
  });

  it('breaks a tie on the lowest Character id', () => {
    const out = keepOneSharedFire([update(2, [skyhook(2, 3)]), update(1, [skyhook(1, 3)])], BOTH);
    expect(keptBy(out)).toEqual([1]);
  });

  it('prefers a Character who has the event on over a nearer one who has it off', () => {
    const off = { skyhookRaidableNearby: false };
    const out = keepOneSharedFire(
      [update(1, [skyhook(1, 1)], off), update(2, [skyhook(2, 6)])],
      BOTH
    );
    expect(keptBy(out)).toEqual([2]);
  });

  it('leaves every other event, and a lone world-scoped fire, alone', () => {
    const out = keepOneSharedFire(
      [update(1, [mail(1), skyhook(1, 4)]), update(2, [mail(2)])],
      BOTH
    );
    expect(out[0].fires).toHaveLength(2);
    expect(out[1].fires).toHaveLength(1);
  });
});
