import { describe, expect, it } from 'vitest';
import { planEntryMerges, planGroupEjections, type CoalescableAssignment } from './coalesce';

function make(overrides: Partial<CoalescableAssignment> = {}): CoalescableAssignment {
  return {
    id: 'a',
    characterId: 1,
    date: '2026-09-12',
    solarSystemId: 30000001,
    payeeId: 'payee-1',
    taxPct: 5,
    status: 'outstanding',
    oreLines: [{ typeId: 100, quantity: 10 }],
    estimatedValue: 1000,
    taxOwed: 50,
    hasPayment: false,
    ...overrides,
  };
}

describe('planEntryMerges', () => {
  it('fuses two Assignments covering one entry on the same terms', () => {
    const plans = planEntryMerges([
      make({ id: 'b', oreLines: [{ typeId: 200, quantity: 5 }], estimatedValue: 400, taxOwed: 20 }),
      make({
        id: 'a',
        oreLines: [{ typeId: 100, quantity: 10 }],
        estimatedValue: 1000,
        taxOwed: 50,
      }),
    ]);
    expect(plans).toEqual([
      {
        keepId: 'a',
        absorbedIds: ['b'],
        oreLines: [
          { typeId: 100, quantity: 10 },
          { typeId: 200, quantity: 5 },
        ],
        estimatedValue: 1400,
        taxOwed: 70,
        collectsGrowth: false,
      },
    ]);
  });

  it('sums the quantities of an ore type both halves hold', () => {
    const [plan] = planEntryMerges([
      make({ id: 'a', oreLines: [{ typeId: 100, quantity: 8380 }] }),
      make({ id: 'b', oreLines: [{ typeId: 100, quantity: 13530 }] }),
    ]);
    expect(plan.oreLines).toEqual([{ typeId: 100, quantity: 21910 }]);
  });

  it('keeps the growth-collector flag when a third Assignment still covers the entry', () => {
    const [plan] = planEntryMerges([
      make({ id: 'a' }),
      make({ id: 'b', collectsGrowth: true, oreLines: [{ typeId: 200, quantity: 5 }] }),
      make({ id: 'c', payeeId: 'payee-2', oreLines: [{ typeId: 300, quantity: 1 }] }),
    ]);
    expect(plan.collectsGrowth).toBe(true);
  });

  it('leaves halves on different Payees alone', () => {
    expect(planEntryMerges([make({ id: 'a' }), make({ id: 'b', payeeId: 'payee-2' })])).toEqual([]);
  });

  it('leaves halves on different tax rates alone', () => {
    expect(planEntryMerges([make({ id: 'a' }), make({ id: 'b', taxPct: 10 })])).toEqual([]);
  });

  it('leaves halves in different joined groups alone', () => {
    expect(
      planEntryMerges([make({ id: 'a', groupId: 'g1' }), make({ id: 'b', groupId: 'g2' })])
    ).toEqual([]);
  });

  it('fuses halves that share one joined group', () => {
    const plans = planEntryMerges([
      make({ id: 'a', groupId: 'g1' }),
      make({ id: 'b', groupId: 'g1', oreLines: [{ typeId: 200, quantity: 5 }] }),
    ]);
    expect(plans).toHaveLength(1);
    expect(plans[0].groupId).toBe('g1');
  });

  it('fuses a grouped half with a loose one, and the survivor stays in the group', () => {
    // The Payee edited back onto a member that a previous edit had ejected:
    // one entry, one Payee, one rate is one obligation however it got there.
    const plans = planEntryMerges([
      make({ id: 'b', oreLines: [{ typeId: 200, quantity: 5 }] }),
      make({ id: 'a', groupId: 'g1' }),
    ]);
    expect(plans).toHaveLength(1);
    expect(plans[0].keepId).toBe('a');
    expect(plans[0].groupId).toBe('g1');
  });

  it('carries no group id when neither half had one', () => {
    const [plan] = planEntryMerges([
      make({ id: 'a' }),
      make({ id: 'b', oreLines: [{ typeId: 200, quantity: 5 }] }),
    ]);
    expect(plan.groupId).toBeUndefined();
  });

  it('leaves a loose half alone when two rival groups both cover the entry', () => {
    // Which group the loose half belongs to is not knowable, and guessing
    // would move ore between two obligations.
    expect(
      planEntryMerges([
        make({ id: 'a', groupId: 'g1' }),
        make({ id: 'b', groupId: 'g2' }),
        make({ id: 'c' }),
      ])
    ).toEqual([]);
  });

  it('clears the growth-collector flag when the fused record ends up alone on its entry', () => {
    const [plan] = planEntryMerges([
      make({ id: 'a', collectsGrowth: true }),
      make({ id: 'b', oreLines: [{ typeId: 200, quantity: 5 }] }),
    ]);
    expect(plan.collectsGrowth).toBe(false);
  });

  it('never fuses anything but an outstanding Assignment', () => {
    for (const status of ['paid', 'dismissed', 'needs-review']) {
      expect(planEntryMerges([make({ id: 'a', status }), make({ id: 'b', status })])).toEqual([]);
    }
  });

  it('never fuses a record carrying a recorded payment', () => {
    expect(
      planEntryMerges([make({ id: 'a', hasPayment: true }), make({ id: 'b', hasPayment: true })])
    ).toEqual([]);
  });

  it('leaves different dates, systems and characters alone', () => {
    expect(planEntryMerges([make({ id: 'a' }), make({ id: 'b', date: '2026-09-13' })])).toEqual([]);
    expect(planEntryMerges([make({ id: 'a' }), make({ id: 'b', solarSystemId: 2 })])).toEqual([]);
    expect(planEntryMerges([make({ id: 'a' }), make({ id: 'b', characterId: 2 })])).toEqual([]);
  });

  it('has nothing to do for a lone Assignment', () => {
    expect(planEntryMerges([make()])).toEqual([]);
  });
});

describe('planGroupEjections', () => {
  it('leaves a group whose members agree alone', () => {
    expect(
      planGroupEjections([
        make({ id: 'a', groupId: 'g1' }),
        make({ id: 'b', groupId: 'g1', date: '2026-09-13' }),
      ])
    ).toEqual([]);
  });

  it('ejects the member whose Payee was edited away from the group', () => {
    expect(
      planGroupEjections([
        make({ id: 'a', groupId: 'g1' }),
        make({ id: 'b', groupId: 'g1', date: '2026-09-13' }),
        make({ id: 'c', groupId: 'g1', date: '2026-09-14', payeeId: 'payee-2' }),
      ])
    ).toEqual(['c']);
  });

  it('anchors the group on its earliest date, not on input order', () => {
    expect(
      planGroupEjections([
        make({ id: 'c', groupId: 'g1', date: '2026-09-14', payeeId: 'payee-2' }),
        make({ id: 'b', groupId: 'g1', date: '2026-09-13' }),
        make({ id: 'a', groupId: 'g1' }),
      ])
    ).toEqual(['c']);
  });

  it('dissolves a two-member group that no longer agrees', () => {
    expect(
      planGroupEjections([
        make({ id: 'a', groupId: 'g1' }),
        make({ id: 'b', groupId: 'g1', date: '2026-09-13', payeeId: 'payee-2' }),
      ])
    ).toEqual(['a', 'b']);
  });

  it('dissolves a group left with one surviving member', () => {
    expect(planGroupEjections([make({ id: 'a', groupId: 'g1' })])).toEqual(['a']);
  });

  it('ignores ungrouped Assignments', () => {
    expect(planGroupEjections([make({ id: 'a' }), make({ id: 'b' })])).toEqual([]);
  });

  it('treats differing tax rates as disagreement too', () => {
    expect(
      planGroupEjections([
        make({ id: 'a', groupId: 'g1' }),
        make({ id: 'b', groupId: 'g1', date: '2026-09-13' }),
        make({ id: 'c', groupId: 'g1', date: '2026-09-14', taxPct: 10 }),
      ])
    ).toEqual(['c']);
  });
});

describe('planEntryMerges — exact duplicates', () => {
  const entries = (qty: number) =>
    new Map([['1:2026-09-12:30000001', [{ typeId: 100, quantity: qty }]]]);

  it('drops the extra of two identical records that each equal the entry instead of summing', () => {
    const plans = planEntryMerges(
      [
        make({ id: 'a', estimatedValue: 1000, taxOwed: 50 }),
        make({ id: 'b', estimatedValue: 1180, taxOwed: 59 }),
      ],
      entries(10)
    );
    expect(plans).toEqual([
      {
        keepId: 'a',
        absorbedIds: ['b'],
        oreLines: [{ typeId: 100, quantity: 10 }],
        estimatedValue: 1000,
        taxOwed: 50,
        collectsGrowth: false,
      },
    ]);
  });

  it('keeps the joined record when only one of the duplicates carries a group', () => {
    const [plan] = planEntryMerges(
      [make({ id: 'a' }), make({ id: 'b', groupId: 'g1' })],
      entries(10)
    );
    expect(plan.keepId).toBe('b');
    expect(plan.absorbedIds).toEqual(['a']);
    expect(plan.groupId).toBe('g1');
  });

  it('still sums identical halves that together equal the entry', () => {
    const [plan] = planEntryMerges(
      [
        make({ id: 'a', oreLines: [{ typeId: 100, quantity: 5 }] }),
        make({ id: 'b', oreLines: [{ typeId: 100, quantity: 5 }] }),
      ],
      entries(10)
    );
    expect(plan.oreLines).toEqual([{ typeId: 100, quantity: 10 }]);
    expect(plan.estimatedValue).toBe(2000);
  });

  it('leaves identical records alone when the entry is not in the ledger read', () => {
    expect(planEntryMerges([make({ id: 'a' }), make({ id: 'b' })], new Map())).toEqual([]);
  });
});
