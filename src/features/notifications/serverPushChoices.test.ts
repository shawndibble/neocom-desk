import { describe, expect, it } from 'vitest';
import {
  SERVER_PUSHED_EVENT_IDS,
  serverPushChoicesByCharacter,
  type ServerPushChoicesDependencies,
} from './serverPushChoices';

const deps = (
  over: Partial<ServerPushChoicesDependencies> = {}
): ServerPushChoicesDependencies => ({
  characters: async () => [
    { characterId: 1, name: 'A' },
    { characterId: 2, name: 'B' },
  ],
  masterEnabled: async () => true,
  browserChannelEnabled: async () => true,
  permission: () => 'granted',
  eventPrefsFor: async (id) => (id === 2 ? { incursionNearby: { browser: false } } : {}),
  thresholdsFor: async (id) => ({
    incursionNearbyJumps: id === 1 ? 10 : 5,
    skyhookRaidableNearbyJumps: 3,
  }),
  ...over,
});

describe('serverPushChoicesByCharacter', () => {
  it('lists the server-pushed events each Character enabled for the browser channel, sorted', async () => {
    const choices = await serverPushChoicesByCharacter(deps());
    expect(choices.get(1)).toEqual({
      serverEvents: ['incursionNearby', 'skyhookRaidableNearby'],
      nearbyJumps: { incursionNearby: 10, skyhookRaidableNearby: 3 },
    });
    expect(choices.get(2)).toEqual({
      serverEvents: ['skyhookRaidableNearby'],
      nearbyJumps: { incursionNearby: 5, skyhookRaidableNearby: 3 },
    });
  });

  it.each([
    ['the master switch is off', { masterEnabled: async () => false }],
    ['the browser channel is off', { browserChannelEnabled: async () => false }],
    ['permission is not granted', { permission: () => 'denied' as const }],
  ])('uploads an empty list for every Character when %s', async (_, over) => {
    const choices = await serverPushChoicesByCharacter(deps(over));
    expect(choices.get(1)?.serverEvents).toEqual([]);
    expect(choices.get(2)?.serverEvents).toEqual([]);
  });

  it('only names server-pushed events', () => {
    expect([...SERVER_PUSHED_EVENT_IDS].sort()).toEqual([
      'incursionNearby',
      'skyhookRaidableNearby',
    ]);
  });
});
