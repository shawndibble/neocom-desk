import { describe, expect, it } from 'vitest';
import {
  blueprintSourceOf,
  hoursLeft,
  profitAtCap,
  remainingUnits,
  toManufactureProject,
  type ProjectDetailInput,
} from './corpProjects';

const detail = (over: Partial<ProjectDetailInput> = {}): ProjectDetailInput => ({
  id: 'p1',
  name: 'Hurricane hulls',
  state: 'Active',
  progress: { current: 20, desired: 50 },
  reward: { initial: 2_090_000_000, remaining: 1_254_000_000 },
  details: { expires: '2026-10-27T10:00:00Z' },
  contribution: {
    participation_limit: 10,
    reward_per_contribution: 41_800_000,
    submission_limit: 10,
    submission_multiplier: 1,
  },
  configuration: { manufacture_item: { owner: 'Any', items: [{ type_id: 24702 }] } },
  ...over,
});

describe('toManufactureProject', () => {
  it('reads a one-type manufacture project with the Character’s own contribution', () => {
    expect(toManufactureProject(detail(), 3)).toEqual({
      id: 'p1',
      name: 'Hurricane hulls',
      typeId: 24702,
      rewardEach: 41_800_000,
      poolInitial: 2_090_000_000,
      poolRemaining: 1_254_000_000,
      cap: 10,
      contributed: 3,
      expires: '2026-10-27T10:00:00Z',
    });
  });

  it('skips every other kind of project without throwing', () => {
    expect(toManufactureProject(detail({ configuration: { mine_material: {} } }), 0)).toBeNull();
    expect(toManufactureProject(detail({ configuration: { unknown: {} } }), 0)).toBeNull();
    expect(toManufactureProject(detail({ configuration: {} }), 0)).toBeNull();
    expect(toManufactureProject(detail({ configuration: null as never }), 0)).toBeNull();
  });

  it('skips a manufacture project that names a group or several types: no single item to price', () => {
    const group = { manufacture_item: { owner: 'Any', items: [{ group_id: 25 }] } };
    const many = {
      manufacture_item: { owner: 'Any', items: [{ type_id: 1 }, { type_id: 2 }] },
    };
    expect(toManufactureProject(detail({ configuration: group }), 0)).toBeNull();
    expect(toManufactureProject(detail({ configuration: many }), 0)).toBeNull();
    expect(
      toManufactureProject(detail({ configuration: { manufacture_item: { owner: 'Any' } } }), 0)
    ).toBeNull();
  });

  it('skips a project with no contribution terms or no reward pool', () => {
    expect(toManufactureProject(detail({ contribution: undefined }), 0)).toBeNull();
    expect(toManufactureProject(detail({ reward: undefined }), 0)).toBeNull();
  });

  it('keeps a project that never expires, with no end date', () => {
    expect(toManufactureProject(detail({ details: {} }), 0)?.expires).toBeNull();
  });
});

describe('remainingUnits', () => {
  const base = {
    rewardEach: 100,
    cap: 10,
    contributed: 3,
    poolRemaining: 10_000,
  };

  it('is the cap minus what the Character has contributed', () => {
    expect(remainingUnits(base)).toBe(7);
  });

  it('is held to what the pool can still pay for', () => {
    expect(remainingUnits({ ...base, poolRemaining: 250 })).toBe(2);
  });

  it('is never negative', () => {
    expect(remainingUnits({ ...base, contributed: 12 })).toBe(0);
    expect(remainingUnits({ ...base, poolRemaining: 0 })).toBe(0);
  });

  it('reads a zero reward as nothing to build rather than dividing by zero', () => {
    expect(remainingUnits({ ...base, rewardEach: 0 })).toBe(0);
  });
});

describe('hoursLeft', () => {
  const now = new Date('2026-10-23T10:00:00Z');
  it('counts whole hours to the end date, rounding down', () => {
    expect(hoursLeft('2026-10-27T10:30:00Z', now)).toBe(96);
  });
  it('is zero once ended and null with no end date', () => {
    expect(hoursLeft('2026-10-20T10:00:00Z', now)).toBe(0);
    expect(hoursLeft(null, now)).toBeNull();
  });
});

describe('profitAtCap', () => {
  it('is reward minus build cost over the remaining units, less the copy', () => {
    expect(
      profitAtCap({ rewardEach: 9_900_000, unitCost: 8_100_000, units: 15, copyPrice: 4_200_000 })
    ).toBe(22_800_000);
  });
  it('can be a loss', () => {
    expect(
      profitAtCap({ rewardEach: 1_150_000, unitCost: 1_240_000, units: 12, copyPrice: 350_000 })
    ).toBe(-1_430_000);
  });
});

describe('blueprintSourceOf', () => {
  const none = { owned: null, row: undefined };

  it('is Owned, with its type and research, whenever the Character holds the blueprint', () => {
    expect(blueprintSourceOf({ owned: { runs: -1, me: 10, te: 20 }, row: undefined })).toEqual({
      kind: 'owned',
      detail: { original: true, me: 10, te: 20 },
    });
    expect(blueprintSourceOf({ owned: { runs: 40, me: 2, te: 4 }, row: undefined })).toEqual({
      kind: 'owned',
      detail: { original: false, me: 2, te: 4 },
    });
  });

  it('is a Community offer, free, when a Shared Blueprint prices the plan', () => {
    expect(
      blueprintSourceOf({
        ...none,
        row: {
          unitPrice: 0,
          quantity: 1,
          acquisitionTier: { community: { memberName: 'Mira Okonkwo', stale: false } },
        },
      })
    ).toEqual({ kind: 'community', memberName: 'Mira Okonkwo' });
  });

  it('is the cheapest copy, at the row’s total price, when one has to be bought', () => {
    expect(
      blueprintSourceOf({
        ...none,
        row: { unitPrice: 2_100_000, quantity: 2, acquisitionTier: {} },
      })
    ).toEqual({ kind: 'copy', price: 4_200_000 });
  });

  it('assumes a copy, priced at 0, when nothing is for sale', () => {
    expect(
      blueprintSourceOf({ ...none, row: { unitPrice: null, quantity: 1, acquisitionTier: {} } })
    ).toEqual({ kind: 'assumed' });
    expect(blueprintSourceOf(none)).toEqual({ kind: 'assumed' });
  });
});
