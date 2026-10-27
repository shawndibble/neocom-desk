import { describe, expect, it } from 'vitest';
import {
  ACTIVE_WARS_HORIZON_IDS,
  advanceSweep,
  mergeOpenWars,
  parseEsiWar,
  planSweep,
  type StoredWar,
} from './activeWars.js';

const NOW = Date.UTC(2026, 9, 21, 12);
const HOUR = 3_600_000;

const esiWar = (over: Record<string, unknown> = {}) => ({
  id: 763512,
  declared: '2026-10-20T06:00:00Z',
  started: '2026-10-21T06:00:00Z',
  mutual: false,
  open_for_allies: true,
  aggressor: { alliance_id: 99, isk_destroyed: 1.5e9, ships_killed: 4 },
  defender: { corporation_id: 7, isk_destroyed: 2e8, ships_killed: 1 },
  allies: [{ corporation_id: 5 }, { alliance_id: 6 }],
  ...over,
});

const stored = (id: number, over: Partial<StoredWar> = {}): StoredWar => ({
  id,
  declared: NOW - 10 * HOUR,
  started: NOW - HOUR,
  mutual: false,
  openForAllies: false,
  aggressor: { corporationId: 1, iskDestroyed: 0, shipsKilled: 0 },
  defender: { corporationId: 2, iskDestroyed: 0, shipsKilled: 0 },
  allies: [],
  ...over,
});

describe('parseEsiWar', () => {
  it('maps ESI snake_case to the stored shape, times to epoch ms', () => {
    expect(parseEsiWar(esiWar())).toEqual({
      id: 763512,
      declared: Date.UTC(2026, 9, 20, 6),
      started: Date.UTC(2026, 9, 21, 6),
      mutual: false,
      openForAllies: true,
      aggressor: { allianceId: 99, iskDestroyed: 1.5e9, shipsKilled: 4 },
      defender: { corporationId: 7, iskDestroyed: 2e8, shipsKilled: 1 },
      allies: [{ corporationId: 5 }, { allianceId: 6 }],
    });
  });

  it('keeps finished, and leaves out what ESI omits', () => {
    const parsed = parseEsiWar(esiWar({ started: undefined, finished: '2026-10-25T06:00:00Z' }));
    expect(parsed?.finished).toBe(Date.UTC(2026, 9, 25, 6));
    expect(parsed).not.toHaveProperty('started');
    expect(parseEsiWar(esiWar({ allies: undefined }))?.allies).toEqual([]);
  });

  it('is null for a body that is not a war', () => {
    expect(parseEsiWar(null)).toBeNull();
    expect(parseEsiWar({ id: 1 })).toBeNull();
    expect(parseEsiWar(esiWar({ declared: 'not a date' }))).toBeNull();
  });
});

describe('planSweep', () => {
  // The newest 6 ids, newest first.
  const listed = [106, 105, 104, 103, 102, 101];

  it('on a first run starts seeding from the newest id and fetches no "new" ids', () => {
    const plan = planSweep(listed, {}, [], 3);
    expect(plan.newIds).toEqual([]);
    expect(plan.seedIds).toEqual([106, 105, 104]);
  });

  it('fetches every id above the top seen, then re-checks the open wars, then seeds downward', () => {
    const plan = planSweep(listed, { topId: 103, floorId: 103 }, [90, 103], 10);
    expect(plan.newIds).toEqual([106, 105, 104]);
    expect(plan.openIds).toEqual([90, 103]);
    expect(plan.seedIds).toEqual([102, 101]);
  });

  it('never drops new or open ids for the budget; only seeding is cut', () => {
    const plan = planSweep(listed, { topId: 104, floorId: 104 }, [90], 1);
    expect([...plan.newIds, ...plan.openIds]).toEqual([106, 105, 90]);
    expect(plan.seedIds).toEqual([]);
  });

  it('stops seeding below the horizon', () => {
    const wide = [ACTIVE_WARS_HORIZON_IDS + 10, 10];
    const plan = planSweep(wide, { topId: 100, floorId: ACTIVE_WARS_HORIZON_IDS + 11 }, [], 50);
    expect(plan.seedIds).toEqual([ACTIVE_WARS_HORIZON_IDS + 10]);
  });
});

describe('advanceSweep', () => {
  const listed = [106, 105, 104, 103, 102, 101];

  it('moves the top up to the newest once every new id was read', () => {
    const plan = planSweep(listed, { topId: 103, floorId: 103 }, [], 0);
    const next = advanceSweep(listed, { topId: 103, floorId: 103 }, plan, new Set([106, 105, 104]));
    expect(next.topId).toBe(106);
  });

  it('keeps the old top when a new id failed, so it is tried again', () => {
    const plan = planSweep(listed, { topId: 103, floorId: 103 }, [], 0);
    const next = advanceSweep(listed, { topId: 103, floorId: 103 }, plan, new Set([106, 104]));
    expect(next.topId).toBe(103);
  });

  it('lowers the floor only through an unbroken run of read seed ids', () => {
    const plan = planSweep(listed, {}, [], 4); // seeds 106,105,104,103
    const next = advanceSweep(listed, {}, plan, new Set([106, 105, 103]));
    expect(next.floorId).toBe(105);
  });

  it('on a first run, sets top to the newest id', () => {
    const plan = planSweep(listed, {}, [], 2);
    expect(advanceSweep(listed, {}, plan, new Set([106, 105])).topId).toBe(106);
  });
});

describe('mergeOpenWars', () => {
  it('replaces a re-read war and adds a new one', () => {
    const merged = mergeOpenWars(
      [stored(1)],
      [stored(1, { mutual: true }), stored(2, { declared: NOW - 20 * HOUR })],
      [],
      NOW
    );
    expect(merged.map((w) => [w.id, w.mutual])).toEqual([
      [1, true],
      [2, false],
    ]);
  });

  it('drops a war that has finished, and one ESI no longer has', () => {
    const merged = mergeOpenWars(
      [stored(1), stored(2), stored(3)],
      [stored(1, { finished: NOW - 1 })],
      [3],
      NOW
    );
    expect(merged.map((w) => w.id)).toEqual([2]);
  });

  it('keeps a war whose end is still in the future', () => {
    expect(mergeOpenWars([], [stored(1, { finished: NOW + HOUR })], [], NOW)).toHaveLength(1);
  });

  it('sorts newest declared first so the doc is stable', () => {
    const merged = mergeOpenWars(
      [stored(1, { declared: 1 })],
      [stored(2, { declared: 5 })],
      [],
      NOW
    );
    expect(merged.map((w) => w.id)).toEqual([2, 1]);
  });
});
