import { describe, expect, it } from 'vitest';
import type { EftSlotLookup } from './eftLoader';
import type { KillmailVictim } from './linkLoader';
import { groupPopularFits, popularFitLoad, type HullLoss } from './popularFits';

const SLOTS: EftSlotLookup = {
  100: 'high',
  101: 'high',
  200: 'medium',
  300: 'low',
  400: 'rig',
  500: 'drone',
};
const CHARGE = 900; // no rack of its own: a charge
const HULL = 626;

type Item = NonNullable<KillmailVictim['items']>[number];
function item(typeId: number, flag: number, destroyed = 1, dropped = 0): Item {
  return {
    item_type_id: typeId,
    flag,
    quantity_destroyed: destroyed,
    quantity_dropped: dropped,
    singleton: 0,
  };
}

/** Two highs (one with a charge), a mid, a low and a rig. */
const FIT_A: Item[] = [
  item(100, 27),
  item(CHARGE, 27, 40),
  item(101, 28, 0, 1),
  item(200, 19),
  item(300, 11),
  item(400, 92),
];
/** A different fit: three lows. */
const FIT_B: Item[] = [item(300, 11), item(300, 12), item(300, 13)];

function loss(
  killmailId: number,
  items: Item[],
  extra: Partial<Omit<HullLoss, 'killmailId' | 'victim'>> = {}
): HullLoss {
  return {
    killmailId,
    time: null,
    value: null,
    ...extra,
    victim: { ship_type_id: HULL, items },
  };
}

describe('groupPopularFits', () => {
  it('groups losses by their fitted modules, most flown first', () => {
    const fits = groupPopularFits(
      [loss(1, FIT_A), loss(2, FIT_B), loss(3, FIT_A), loss(4, FIT_A)],
      SLOTS
    );
    expect(fits.map((fit) => [fit.count, fit.killmailIds])).toEqual([
      [3, [4, 3, 1]],
      [1, [2]],
    ]);
  });

  it('ignores charges, cargo and the drone bay, and which slot a module sat in', () => {
    const reshuffled = [
      item(101, 27),
      item(100, 29),
      item(200, 20),
      item(300, 15),
      item(400, 93),
      item(CHARGE, 5, 100),
      item(500, 87, 5),
    ];
    const fits = groupPopularFits([loss(1, FIT_A), loss(2, reshuffled)], SLOTS);
    expect(fits).toHaveLength(1);
    expect(fits[0].count).toBe(2);
  });

  it('skips a loss with fewer than 3 fitted modules', () => {
    const fits = groupPopularFits([loss(1, [item(100, 27), item(200, 19)])], SLOTS);
    expect(fits).toEqual([]);
  });

  it('breaks a count tie by the most recent loss', () => {
    const fits = groupPopularFits(
      [
        loss(10, FIT_A, { time: '2026-09-01T00:00:00Z' }),
        loss(5, FIT_B, { time: '2026-09-20T00:00:00Z' }),
      ],
      SLOTS
    );
    expect(fits.map((fit) => fit.killmailIds[0])).toEqual([5, 10]);
    expect(fits[0].lastSeen).toBe('2026-09-20T00:00:00Z');
  });

  it("averages the value over the group's losses that carry one", () => {
    const fits = groupPopularFits(
      [loss(1, FIT_A, { value: 100 }), loss(2, FIT_A, { value: 300 }), loss(3, FIT_A)],
      SLOTS
    );
    expect(fits[0].value).toBe(200);
    expect(groupPopularFits([loss(1, FIT_A)], SLOTS)[0].value).toBeNull();
  });

  it("opens the group's most recent loss, charges kept and cargo left out", () => {
    const older = loss(1, FIT_A, { time: '2026-09-01T00:00:00Z' });
    const newer = loss(2, [...FIT_A, item(CHARGE, 5, 1000), item(500, 87, 3)], {
      time: '2026-09-02T00:00:00Z',
    });
    const [fit] = groupPopularFits([older, newer], SLOTS);
    const loaded = popularFitLoad(fit, 'Vexor');
    expect(loaded.kind).toBe('fitting');
    expect(loaded.unresolved).toEqual([]);
    expect(loaded.fitting.name).toBe('Vexor');
    expect(loaded.fitting.shipTypeId).toBe(HULL);
    expect(loaded.fitting.cargo).toEqual([]);
    expect(loaded.fitting.drones).toEqual([{ typeId: 500, quantity: 3, state: 'online' }]);
    expect(
      loaded.fitting.modules.map(({ slot, slotIndex, typeId, chargeTypeId }) => ({
        slot,
        slotIndex,
        typeId,
        chargeTypeId,
      }))
    ).toEqual(
      expect.arrayContaining([
        { slot: 'high', slotIndex: 0, typeId: 100, chargeTypeId: CHARGE },
        { slot: 'high', slotIndex: 1, typeId: 101, chargeTypeId: undefined },
        { slot: 'medium', slotIndex: 0, typeId: 200, chargeTypeId: undefined },
        { slot: 'low', slotIndex: 0, typeId: 300, chargeTypeId: undefined },
        { slot: 'rig', slotIndex: 0, typeId: 400, chargeTypeId: undefined },
      ])
    );
    expect(loaded.fitting.modules).toHaveLength(5);
  });
});
