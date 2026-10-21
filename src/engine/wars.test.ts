import { describe, expect, it } from 'vitest';
import { parseStoredWars, warsAgainst, warStatus, type StoredWar, type WarEntityIds } from './wars';

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 9, 21, 12);

function war(over: Partial<StoredWar> = {}): StoredWar {
  return {
    id: 1,
    declared: NOW - 48 * HOUR,
    started: NOW - 24 * HOUR,
    mutual: false,
    openForAllies: false,
    aggressor: { corporationId: 100, iskDestroyed: 5e6, shipsKilled: 2 },
    defender: { corporationId: 200, iskDestroyed: 1e6, shipsKilled: 1 },
    allies: [],
    ...over,
  };
}

const me: WarEntityIds = { corporationId: 200 };

describe('warStatus', () => {
  it('is pending before the war starts', () => {
    expect(warStatus(war({ started: NOW + 5 * HOUR }), NOW)).toEqual({
      kind: 'pending',
      startsIn: 5 * HOUR,
    });
  });

  it('is active once started with no end', () => {
    expect(warStatus(war(), NOW)).toEqual({ kind: 'active', endsIn: null });
  });

  it('is active until a future finish, and says when it ends', () => {
    expect(warStatus(war({ finished: NOW + 3 * HOUR }), NOW)).toEqual({
      kind: 'active',
      endsIn: 3 * HOUR,
    });
  });

  it('is over once finished', () => {
    expect(warStatus(war({ finished: NOW - 1 }), NOW)).toEqual({ kind: 'over' });
  });

  it('is pending with no known start when ESI gives no started time', () => {
    expect(warStatus(war({ started: undefined, declared: NOW - HOUR }), NOW)).toEqual({
      kind: 'pending',
      startsIn: null,
    });
  });
});

describe('warsAgainst', () => {
  it('returns a war whose defender is my corporation', () => {
    const [hit] = warsAgainst([war()], me, NOW);
    expect(hit?.war.id).toBe(1);
    expect(hit?.side).toBe('defender');
  });

  it('matches my alliance as the defender', () => {
    const wars = [war({ defender: { allianceId: 900, iskDestroyed: 0, shipsKilled: 0 } })];
    expect(warsAgainst(wars, { corporationId: 200, allianceId: 900 }, NOW)).toHaveLength(1);
  });

  it('matches an ally, which is always on the defender side', () => {
    const wars = [
      war({
        defender: { corporationId: 300, iskDestroyed: 0, shipsKilled: 0 },
        allies: [{ corporationId: 200 }],
      }),
    ];
    expect(warsAgainst(wars, me, NOW)[0]?.side).toBe('ally');
  });

  it('ignores a war I declared: that is not a dec against me', () => {
    const wars = [war({ aggressor: { corporationId: 200, iskDestroyed: 0, shipsKilled: 0 } })];
    expect(warsAgainst(wars, me, NOW)).toEqual([]);
  });

  it('ignores wars that are over', () => {
    expect(warsAgainst([war({ finished: NOW - HOUR })], me, NOW)).toEqual([]);
  });

  it('ignores wars about someone else', () => {
    expect(warsAgainst([war()], { corporationId: 999 }, NOW)).toEqual([]);
  });

  it('does not match when I have no ids yet', () => {
    expect(warsAgainst([war()], {}, NOW)).toEqual([]);
  });

  it('puts the war already active before one still pending, then newest declared first', () => {
    const pending = war({ id: 2, started: NOW + HOUR, declared: NOW - HOUR });
    const old = war({ id: 3, declared: NOW - 100 * HOUR });
    const recent = war({ id: 4, declared: NOW - 30 * HOUR });
    expect(warsAgainst([pending, old, recent], me, NOW).map((w) => w.war.id)).toEqual([4, 3, 2]);
  });
});

describe('parseStoredWars', () => {
  it('reads a stored doc', () => {
    const doc = { updatedAt: NOW, wars: [war()] };
    expect(parseStoredWars(doc)).toEqual({ updatedAt: NOW, wars: [war()] });
  });

  it('is null for anything that is not the expected doc', () => {
    expect(parseStoredWars(undefined)).toBeNull();
    expect(parseStoredWars({ updatedAt: 'x', wars: [] })).toBeNull();
    expect(parseStoredWars({ updatedAt: NOW, wars: 'no' })).toBeNull();
  });

  it('drops a malformed row and keeps the rest', () => {
    const doc = { updatedAt: NOW, wars: [war(), { id: 'bad' }, null] };
    expect(parseStoredWars(doc)?.wars).toEqual([war()]);
  });
});
