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
  it('sums each member’s own materialCost and job fee into one total', () => {
    // No ledger in play, so totalCost is exactly what summing each member's
    // own totalCost would give — derived from materialCost + jobFee instead
    // of member.totalCost directly (see module doc), since materialCost is
    // where a group ledger's saving is deducted.
    const rollup = rollUpBuildGroup([
      member({
        planId: 'a',
        result: result({ materialCost: 100, jobFee: { total: 5 } as never, totalCost: 105 }),
      }),
      member({
        planId: 'b',
        result: result({ materialCost: 295, jobFee: { total: 5 } as never, totalCost: 300 }),
      }),
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

  it('passes ownedQuantity/remainingQuantity through unmodified when no group ledger is given', () => {
    // Members are re-resolved with owned-stock deduction disabled before
    // reaching this function (issue #697), so ownedQuantity is normally 0 —
    // but the merge itself stays a plain sum regardless of what it is handed;
    // netting is the `ownedStock` option's job, not an implicit one.
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

describe('rollUpBuildGroup — group-owned ledger', () => {
  it('nets the ledger against the merged buy list and reduces the group total', () => {
    const ownedStock = new Map([[34, 60]]);
    const rollup = rollUpBuildGroup(
      [
        member({
          planId: 'a',
          result: result({ materialCost: 1000, totalCost: 1005 }),
          shoppingMaterials: [line(34, 100)],
        }),
      ],
      { ownedStock }
    );
    const trit = rollup.shoppingMaterials.find((m) => m.typeID === 34);
    expect(trit?.ownedQuantity).toBe(60);
    expect(trit?.remainingQuantity).toBe(40);
    expect(trit?.lineCost).toBe(400); // 40 remaining x unitPrice 10 (see `line()`)
    // The buy list is the cost authority: the 600 ISK the ledger saved on
    // material 34 comes straight off materialCost, and totalCost is derived
    // from the (now net) materialCost plus job fees rather than re-summed
    // from each member's own (gross, owned-disabled) totalCost.
    expect(rollup.materialCost).toBe(400);
    expect(rollup.totalCost).toBe(405);
  });

  it('adds the ledger saving back into profit, keeping it consistent with totalCost', () => {
    // Member's own `profit` is computed against its own (owned-disabled)
    // totalCost of 1005, e.g. revenue 1500 -> profit 495. The group ledger
    // then saves 600 off materialCost/totalCost (as in the test above), so
    // the internally-consistent group profit is 495 + 600 = 1095 — not the
    // naive 495, which would leave `profit` and `totalCost` disagreeing
    // about the same saving on the same rollup.
    const ownedStock = new Map([[34, 60]]);
    const rollup = rollUpBuildGroup(
      [
        member({
          planId: 'a',
          result: result({ materialCost: 1000, totalCost: 1005, profit: 495 }),
          shoppingMaterials: [line(34, 100)],
        }),
      ],
      { ownedStock }
    );
    expect(rollup.totalCost).toBe(405);
    expect(rollup.profit).toBe(1095);
  });

  it('clamps a ledger quantity larger than what is needed', () => {
    const ownedStock = new Map([[34, 999]]);
    const rollup = rollUpBuildGroup([member({ planId: 'a', shoppingMaterials: [line(34, 100)] })], {
      ownedStock,
    });
    const trit = rollup.shoppingMaterials.find((m) => m.typeID === 34);
    expect(trit?.ownedQuantity).toBe(100);
    expect(trit?.remainingQuantity).toBe(0);
    expect(trit?.lineCost).toBe(0);
  });

  it('nets the display table too, but never lets it double a deduction already taken off the buy list', () => {
    // material 999 here is a built row (unitPrice null) — present in the
    // table but not the buy list, so its netting is display-only and must
    // not touch `materialCost`.
    const ownedStock = new Map([
      [34, 50],
      [999, 1],
    ]);
    const rollup = rollUpBuildGroup(
      [
        member({
          planId: 'a',
          result: result({ materialCost: 1000, totalCost: 1005 }),
          shoppingMaterials: [line(34, 100)],
          tableMaterials: [
            line(34, 100),
            line(999, 1, { unitPrice: null, lineCost: 300, remainingQuantity: 1 }),
          ],
        }),
      ],
      { ownedStock }
    );
    const builtRow = rollup.tableMaterials.find((m) => m.typeID === 999);
    expect(builtRow?.ownedQuantity).toBe(1);
    expect(builtRow?.remainingQuantity).toBe(0);
    expect(builtRow?.lineCost).toBe(0); // scaled proportionally from the prior lineCost
    // Only the buy-list saving (material 34, 50 units x 10) comes off the total.
    expect(rollup.materialCost).toBe(500);
  });

  it('ignores a ledger entry for a typeID the group does not need', () => {
    const ownedStock = new Map([[999, 50]]);
    const rollup = rollUpBuildGroup([member({ planId: 'a', shoppingMaterials: [line(34, 100)] })], {
      ownedStock,
    });
    expect(rollup.shoppingMaterials.find((m) => m.typeID === 34)?.remainingQuantity).toBe(100);
    expect(rollup.materialCost).toBe(100);
  });

  it('clears unpriced once the ledger fully covers a line with no known price', () => {
    const ownedStock = new Map([[34, 100]]);
    const rollup = rollUpBuildGroup(
      [
        member({
          planId: 'a',
          shoppingMaterials: [line(34, 100, { unitPrice: null, unpriced: true })],
        }),
      ],
      { ownedStock }
    );
    const trit = rollup.shoppingMaterials.find((m) => m.typeID === 34);
    expect(trit?.remainingQuantity).toBe(0);
    expect(trit?.unpriced).toBe(false);
  });

  it('leaves the group total alone when the ledger is empty', () => {
    const rollup = rollUpBuildGroup(
      [
        member({
          planId: 'a',
          result: result({ materialCost: 100, totalCost: 105 }),
          shoppingMaterials: [line(34, 100)],
        }),
      ],
      { ownedStock: new Map() }
    );
    expect(rollup.materialCost).toBe(100);
    expect(rollup.totalCost).toBe(105);
  });

  it('clears unpriceable once the ledger fully covers the one material that made a member unpriceable', () => {
    // The member's own result is unpriceable against its owned-disabled tree
    // (materialResolution.ts computes that before the ledger ever runs), but
    // the ledger now covers the only unpriced material — the group total must
    // not keep reporting a shortfall that no longer exists.
    const ownedStock = new Map([[34, 100]]);
    const rollup = rollUpBuildGroup(
      [
        member({
          planId: 'a',
          result: result({ unpriceable: true, unpricedMaterials: [34] }),
          shoppingMaterials: [line(34, 100, { unitPrice: null, unpriced: true })],
        }),
      ],
      { ownedStock }
    );
    expect(rollup.unpriceable).toBe(false);
  });

  it('keeps unpriceable when the member’s own product has no price, regardless of the ledger', () => {
    // `unpricedMaterials` empty alongside `unpriceable: true` means the
    // product itself lacked a hub price (buildVsBuy.ts's !productPriced) — no
    // ledger entry can fix that, so it must survive netting.
    const ownedStock = new Map([[34, 999]]);
    const rollup = rollUpBuildGroup(
      [
        member({
          planId: 'a',
          result: result({ unpriceable: true, unpricedMaterials: [] }),
          shoppingMaterials: [line(34, 100)],
        }),
      ],
      { ownedStock }
    );
    expect(rollup.unpriceable).toBe(true);
  });
});

describe('rollUpBuildGroup — blueprint acquisition rows (issue #1776)', () => {
  // The synthetic Blueprint Acquisition row `acquisitionMaterialFor` produces
  // for an owned BPC/BPO: fully owned, one unit, nothing left to buy. Only
  // `tableMaterials` carries the `acquisitionTier` marker in real data
  // (`shoppingListMaterials`'s `costLine` strips it before it reaches this
  // module) — this fixture mirrors that split.
  function acquisitionLine(
    typeID: number,
    extra: Partial<MaterialCostLine> = {}
  ): MaterialCostLine {
    return {
      ...line(typeID, 1, { ownedQuantity: 1, remainingQuantity: 0, lineCost: 0, ...extra }),
      acquisitionTier: { me: 0, te: 0 },
    };
  }

  it('does not net an owned blueprint against the group ledger — the ledger has no opinion about a blueprint', () => {
    const rollup = rollUpBuildGroup(
      [
        member({
          planId: 'a',
          // shoppingMaterials mirrors real data: same owned/remaining split,
          // but no acquisitionTier field at all (costLine already stripped it).
          shoppingMaterials: [
            line(11185, 1, { ownedQuantity: 1, remainingQuantity: 0, lineCost: 0 }),
          ],
          tableMaterials: [acquisitionLine(11185)],
        }),
      ],
      { ownedStock: new Map() }
    );
    const tableRow = rollup.tableMaterials.find((m) => m.typeID === 11185);
    expect(tableRow?.remainingQuantity).toBe(0);
    expect(tableRow?.ownedQuantity).toBe(1);
    const shoppingRow = rollup.shoppingMaterials.find((m) => m.typeID === 11185);
    expect(shoppingRow?.remainingQuantity).toBe(0);
  });

  it('still shows a real shortfall — an unowned blueprint is unaffected by this fix', () => {
    const rollup = rollUpBuildGroup(
      [
        member({
          planId: 'a',
          tableMaterials: [
            acquisitionLine(11185, {
              ownedQuantity: 0,
              remainingQuantity: 1,
              unitPrice: 5_000_000,
              lineCost: 5_000_000,
            }),
          ],
        }),
      ],
      { ownedStock: new Map() }
    );
    const bpcRow = rollup.tableMaterials.find((m) => m.typeID === 11185);
    expect(bpcRow?.remainingQuantity).toBe(1);
  });

  it('still skips netting when two members need the same blueprint typeID, even though the merge itself drops the marker', () => {
    // mergeCostLines merges these two acquisition rows into one plain
    // MaterialCostLine with no acquisitionTier (it doesn't spread the field) —
    // the skip-set must come from each member's own tableMaterials, read
    // before that merge, or this collision silently reopens issue #1776.
    const rollup = rollUpBuildGroup(
      [
        member({ planId: 'a', tableMaterials: [acquisitionLine(11185)] }),
        member({ planId: 'b', tableMaterials: [acquisitionLine(11185)] }),
      ],
      { ownedStock: new Map() }
    );
    const bpcRow = rollup.tableMaterials.find((m) => m.typeID === 11185);
    expect(bpcRow?.remainingQuantity).toBe(0);
    expect(bpcRow?.ownedQuantity).toBe(2);
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
