import { describe, expect, it } from 'vitest';
import { rollUpBuildGroup, type BuildGroupMember } from './groupRollup';
import type { BuildResult, MaterialCostLine } from './types';

function line(
  typeID: number,
  quantity: number,
  extra: Partial<MaterialCostLine> = {}
): MaterialCostLine {
  const ownedQuantity = extra.ownedQuantity ?? 0;
  return {
    typeID,
    baseQuantity: quantity,
    quantity,
    ownedQuantity,
    remainingQuantity: extra.remainingQuantity ?? quantity - ownedQuantity,
    // `in`, not `??`: null is a meaningful value here (the member is building
    // it), and `null ?? 10` would quietly turn every such case into a price.
    unitPrice: 'unitPrice' in extra ? (extra.unitPrice ?? null) : 10,
    lineCost: extra.lineCost ?? (quantity - ownedQuantity) * 10,
    unpriced: extra.unpriced ?? false,
  };
}

function result(over: Partial<BuildResult> = {}): BuildResult {
  return {
    materials: [],
    seconds: 100,
    jobFee: { costIndexFee: 0, facilityTax: 0, sccSurcharge: 0, total: 5 },
    materialCost: 100,
    totalCost: 105,
    buyCost: 200,
    revenue: null,
    salesTax: null,
    brokerFee: null,
    netRevenue: null,
    profit: null,
    marginPct: null,
    iskPerHour: null,
    grossProfit: null,
    grossMargin: null,
    grossIskPerHour: null,
    breakEvenPrice: null,
    unpricedMaterials: [],
    unpriceable: false,
    recommendation: 'build',
    ...over,
  } as BuildResult;
}

function member(over: Partial<BuildGroupMember> = {}): BuildGroupMember {
  return {
    planId: 'p1',
    planName: 'Plan 1',
    hubId: 'jita',
    result: result(),
    shoppingMaterials: [],
    tableMaterials: [],
    ...over,
  };
}

describe('rollUpBuildGroup — totals', () => {
  it('sums each member’s own totalCost', () => {
    const rollup = rollUpBuildGroup([
      member({ planId: 'a', result: result({ totalCost: 105 }) }),
      member({ planId: 'b', result: result({ totalCost: 300 }) }),
    ]);
    expect(rollup.totalCost).toBe(405);
  });

  it('reports job fees as top-level only, since sub-job fees are already inside materialCost', () => {
    // BuildResult.totalCost is materialCost + this job's own fee, with every
    // descendant job's fee already rolled into materialCost. Summing
    // jobFee.total across members is therefore NOT what the pilot pays in
    // fees, and the field says so by its name.
    const rollup = rollUpBuildGroup([
      member({ planId: 'a', result: result({ jobFee: { total: 5 } as never }) }),
      member({ planId: 'b', result: result({ jobFee: { total: 7 } as never }) }),
    ]);
    expect(rollup.topLevelJobFees).toBe(12);
  });

  it('sums seconds as total job time rather than wall-clock', () => {
    const rollup = rollUpBuildGroup([
      member({ planId: 'a', result: result({ seconds: 60 }) }),
      member({ planId: 'b', result: result({ seconds: 90 }) }),
    ]);
    expect(rollup.seconds).toBe(150);
  });

  it('sums buyCost, but reports null when any member is unpriced', () => {
    expect(
      rollUpBuildGroup([
        member({ planId: 'a', result: result({ buyCost: 200 }) }),
        member({ planId: 'b', result: result({ buyCost: 50 }) }),
      ]).buyCost
    ).toBe(250);

    expect(
      rollUpBuildGroup([
        member({ planId: 'a', result: result({ buyCost: 200 }) }),
        member({ planId: 'b', result: result({ buyCost: null }) }),
      ]).buyCost
    ).toBeNull();
  });

  it('is unpriceable when any single member is', () => {
    // One bad member taints the total: every figure below it is an
    // understatement, so the flag has to survive members that priced fine.
    const rollup = rollUpBuildGroup([
      member({ planId: 'a', result: result({ unpriceable: true }) }),
      member({ planId: 'b', result: result() }),
    ]);
    expect(rollup.unpriceable).toBe(true);
  });

  it('totals an empty group to zero rather than throwing', () => {
    const rollup = rollUpBuildGroup([]);
    expect(rollup.totalCost).toBe(0);
    expect(rollup.shoppingMaterials).toEqual([]);
  });
});

describe('rollUpBuildGroup — material merging', () => {
  it('merges one material across members', () => {
    const rollup = rollUpBuildGroup([
      member({ planId: 'a', shoppingMaterials: [line(34, 100)] }),
      member({ planId: 'b', shoppingMaterials: [line(34, 50), line(35, 20)] }),
    ]);
    const trit = rollup.shoppingMaterials.find((m) => m.typeID === 34);
    expect(trit?.quantity).toBe(150);
    expect(trit?.remainingQuantity).toBe(150);
    // Merged as-rounded: each member's job already rounded its own use, so a
    // merged quantity is a sum and never a re-derivation from combined runs.
    expect(trit?.baseQuantity).toBe(150);
    expect(rollup.shoppingMaterials.find((m) => m.typeID === 35)?.quantity).toBe(20);
  });

  it('keeps the buy list and the display table as separate merges', () => {
    // shoppingListMaterials drops built materials and returns leaves;
    // materialTableRows keeps the built rows. Mixing them into one number
    // double-counts whenever one member buys what another member's sub-build
    // also consumes, so the two never meet.
    const rollup = rollUpBuildGroup([
      member({
        planId: 'a',
        shoppingMaterials: [line(34, 100)],
        tableMaterials: [line(34, 100), line(999, 1)],
      }),
    ]);
    expect(rollup.shoppingMaterials.map((m) => m.typeID)).toEqual([34]);
    expect(rollup.tableMaterials.map((m) => m.typeID)).toEqual([34, 999]);
  });

  it('keeps the first real unit price, so a member building it cannot blank a bought row', () => {
    // null means "this member builds it", not "this type has no price".
    const rollup = rollUpBuildGroup([
      member({ planId: 'a', shoppingMaterials: [line(34, 10, { unitPrice: null })] }),
      member({ planId: 'b', shoppingMaterials: [line(34, 10, { unitPrice: 6.5 })] }),
    ]);
    expect(rollup.shoppingMaterials[0].unitPrice).toBe(6.5);
  });

  it('sums remaining quantities rather than re-netting owned stock', () => {
    // Each member already netted against its own stored sourcing, and the
    // member pages are open right beside the group — a group total that
    // disagreed with them would be worse than one that is merely optimistic.
    const rollup = rollUpBuildGroup([
      member({ planId: 'a', shoppingMaterials: [line(34, 100, { ownedQuantity: 100 })] }),
      member({ planId: 'b', shoppingMaterials: [line(34, 100, { ownedQuantity: 100 })] }),
    ]);
    const trit = rollup.shoppingMaterials.find((m) => m.typeID === 34);
    expect(trit?.quantity).toBe(200);
    expect(trit?.ownedQuantity).toBe(200);
    expect(trit?.remainingQuantity).toBe(0);
  });
});

describe('rollUpBuildGroup — over-claimed owned stock', () => {
  it('names a material the members collectively claim more of than exists', () => {
    const detected = new Map([[34, 100]]);
    const rollup = rollUpBuildGroup(
      [
        member({ planId: 'a', shoppingMaterials: [line(34, 100, { ownedQuantity: 100 })] }),
        member({ planId: 'b', shoppingMaterials: [line(34, 100, { ownedQuantity: 100 })] }),
      ],
      { detectedOwnedStock: detected }
    );
    expect(rollup.overClaimed).toEqual([34]);
  });

  it('stays quiet when the claims fit inside what is actually owned', () => {
    const detected = new Map([[34, 500]]);
    const rollup = rollUpBuildGroup(
      [
        member({ planId: 'a', shoppingMaterials: [line(34, 100, { ownedQuantity: 100 })] }),
        member({ planId: 'b', shoppingMaterials: [line(34, 100, { ownedQuantity: 100 })] }),
      ],
      { detectedOwnedStock: detected }
    );
    expect(rollup.overClaimed).toEqual([]);
  });

  it('claims nothing when detection is unavailable', () => {
    // No snapshot is not evidence of an empty hangar, so an absent detection
    // must never be read as "you own zero of everything".
    const rollup = rollUpBuildGroup([
      member({ planId: 'a', shoppingMaterials: [line(34, 100, { ownedQuantity: 100 })] }),
    ]);
    expect(rollup.overClaimed).toEqual([]);
  });
});

describe('rollUpBuildGroup — mixed hubs', () => {
  it('reports a single hub as pasteable', () => {
    const rollup = rollUpBuildGroup([
      member({ planId: 'a', hubId: 'jita' }),
      member({ planId: 'b', hubId: 'jita' }),
    ]);
    expect(rollup.hubIds).toEqual(['jita']);
    expect(rollup.singleHub).toBe(true);
  });

  it('names every hub in a mixed group and refuses the single paste', () => {
    // ISK still sums — a hub does not change what a number means — but
    // multibuy is per-station, so one blob cannot be pasted anywhere.
    const rollup = rollUpBuildGroup([
      member({ planId: 'a', hubId: 'jita' }),
      member({ planId: 'b', hubId: 'amarr' }),
      member({ planId: 'c', hubId: 'jita' }),
    ]);
    expect(rollup.hubIds).toEqual(['jita', 'amarr']);
    expect(rollup.singleHub).toBe(false);
    expect(rollup.totalCost).toBe(315);
  });
});

describe('rollUpBuildGroup — buy list per hub', () => {
  it('keeps one block per hub, in the same order as hubIds', () => {
    const rollup = rollUpBuildGroup([
      member({ planId: 'a', hubId: 'jita', shoppingMaterials: [line(34, 100)] }),
      member({ planId: 'b', hubId: 'amarr', shoppingMaterials: [line(35, 50)] }),
      member({ planId: 'c', hubId: 'jita', shoppingMaterials: [line(34, 20)] }),
    ]);
    expect(rollup.shoppingByHub.map((block) => block.hubId)).toEqual(rollup.hubIds);
    expect(rollup.shoppingByHub.map((block) => block.hubId)).toEqual(['jita', 'amarr']);
  });

  it('merges members sharing a hub into one line, as the group total does', () => {
    const rollup = rollUpBuildGroup([
      member({ planId: 'a', hubId: 'jita', shoppingMaterials: [line(34, 100)] }),
      member({ planId: 'b', hubId: 'jita', shoppingMaterials: [line(34, 20)] }),
    ]);
    expect(rollup.shoppingByHub).toHaveLength(1);
    expect(rollup.shoppingByHub[0].materials).toHaveLength(1);
    expect(rollup.shoppingByHub[0].materials[0].quantity).toBe(120);
  });

  it('splits a material two hubs both need, rather than picking one', () => {
    const rollup = rollUpBuildGroup([
      member({ planId: 'a', hubId: 'jita', shoppingMaterials: [line(34, 100)] }),
      member({ planId: 'b', hubId: 'amarr', shoppingMaterials: [line(34, 30)] }),
    ]);
    expect(rollup.shoppingByHub[0].materials[0].remainingQuantity).toBe(100);
    expect(rollup.shoppingByHub[1].materials[0].remainingQuantity).toBe(30);
  });

  it('accounts for every unit of the group buy list and no more', () => {
    // The invariant that makes the split honest: pasting each block buys
    // exactly what the group as a whole says it needs.
    const rollup = rollUpBuildGroup([
      member({ planId: 'a', hubId: 'jita', shoppingMaterials: [line(34, 100), line(35, 5)] }),
      member({ planId: 'b', hubId: 'amarr', shoppingMaterials: [line(34, 30)] }),
      member({ planId: 'c', hubId: 'rens', shoppingMaterials: [line(35, 7)] }),
    ]);
    const perHub = new Map<number, number>();
    for (const block of rollup.shoppingByHub) {
      for (const material of block.materials) {
        perHub.set(
          material.typeID,
          (perHub.get(material.typeID) ?? 0) + material.remainingQuantity
        );
      }
    }
    expect(perHub).toEqual(
      new Map(rollup.shoppingMaterials.map((m) => [m.typeID, m.remainingQuantity]))
    );
  });

  it('gives a single-hub group one block holding the whole buy list', () => {
    const rollup = rollUpBuildGroup([
      member({ planId: 'a', hubId: 'jita', shoppingMaterials: [line(34, 100)] }),
      member({ planId: 'b', hubId: 'jita', shoppingMaterials: [line(35, 50)] }),
    ]);
    expect(rollup.shoppingByHub).toHaveLength(1);
    expect(rollup.shoppingByHub[0].materials).toEqual(rollup.shoppingMaterials);
  });

  it('has no blocks for an empty group', () => {
    expect(rollUpBuildGroup([]).shoppingByHub).toEqual([]);
  });

  it('still lists a hub whose materials are all owned, and leaves the gating to the caller', () => {
    // Same rule as the group-wide control: the block exists so the hub is
    // named, and the caller disables a copy that would write an empty string.
    const rollup = rollUpBuildGroup([
      member({ planId: 'a', hubId: 'jita', shoppingMaterials: [line(34, 100)] }),
      member({
        planId: 'b',
        hubId: 'amarr',
        shoppingMaterials: [line(35, 50, { ownedQuantity: 50, remainingQuantity: 0 })],
      }),
    ]);
    expect(rollup.shoppingByHub.map((block) => block.hubId)).toEqual(['jita', 'amarr']);
    expect(rollup.shoppingByHub[1].materials[0].remainingQuantity).toBe(0);
  });
});
