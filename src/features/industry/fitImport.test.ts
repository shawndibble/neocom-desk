import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, type BuildPlanRecord } from '@/db';
import type { FitToBuildPlansResult } from '@/engine/import/fitToBuildPlans';
import { DEFAULT_FACILITY_DEFAULTS } from './facilityDefaults';
import type { BlueprintCatalog, BlueprintCatalogEntry } from './blueprintCatalog';
import { buildGroupsFor, type BuildGroupsValue } from './buildGroups';
import {
  applyFitImport,
  fitBlueprintLookup,
  fitImportGroupName,
  fitImportPlans,
  previewFitImport,
} from './fitImport';

const BUZZARD_BP = 11194;
const BUZZARD = 11192;
const AMMO_BP = 1000;
const AMMO = 1001;

function bpEntry(
  blueprintTypeID: number,
  productTypeID: number,
  productName: string,
  perRun = 1
): BlueprintCatalogEntry {
  return {
    blueprintTypeID,
    blueprint: {
      name: `${productName} Blueprint`,
      time: 100,
      materials: [],
      products: [{ typeID: productTypeID, quantity: perRun }],
      skills: [],
      activity: 'manufacturing',
    },
    productTypeID,
    productName,
    productNameLower: productName.toLowerCase(),
  };
}

const ENTRIES = [
  bpEntry(BUZZARD_BP, BUZZARD, 'Buzzard'),
  bpEntry(AMMO_BP, AMMO, 'Scourge Fury Heavy Missile', 100),
];

const CATALOG: BlueprintCatalog = {
  entries: ENTRIES,
  byBlueprintTypeID: new Map(ENTRIES.map((e) => [e.blueprintTypeID, e])),
  byProductTypeID: new Map(ENTRIES.map((e) => [e.productTypeID as number, e])),
  typesById: {
    [BUZZARD]: { name: 'Buzzard', groupID: 830, volume: 19400 },
    [AMMO]: { name: 'Scourge Fury Heavy Missile', groupID: 654, volume: 0.03 },
    // A faction module: it has a name in the SDE but nothing produces it.
    2000: { name: 'Sisters Core Probe Launcher', groupID: 481, volume: 5 },
  },
};

describe('fitBlueprintLookup', () => {
  const lookup = fitBlueprintLookup(CATALOG);

  it('resolves an item name to the blueprint that makes it', () => {
    expect(lookup('Buzzard')).toMatchObject({
      blueprintTypeID: BUZZARD_BP,
      productTypeID: BUZZARD,
      productName: 'Buzzard',
      unitsPerRun: 1,
    });
  });

  it('ignores case and surrounding space, as a pasted fit is not normalised', () => {
    expect(lookup('  buzzard  ')?.blueprintTypeID).toBe(BUZZARD_BP);
  });

  it('reads the batch size from the blueprint, not from the fit', () => {
    expect(lookup('Scourge Fury Heavy Missile')?.unitsPerRun).toBe(100);
  });

  it('returns null for an item nothing produces', () => {
    // Faction, named and meta modules drop from NPCs and have no blueprint at
    // all — roughly a fifth of a routine fit.
    expect(lookup('Sisters Core Probe Launcher')).toBeNull();
  });

  it('returns null for a name that is not in the catalog', () => {
    expect(lookup('Nonexistent Module IX')).toBeNull();
  });
});

describe('previewFitImport', () => {
  it('parses and resolves a paste in one step', () => {
    const preview = previewFitImport(
      '[Buzzard, Max Hacker]\n\nScourge Fury Heavy Missile x150\nSisters Core Probe Launcher',
      CATALOG
    );
    expect(preview.hull?.productName).toBe('Buzzard');
    expect(preview.groupName).toBe('Max Hacker');
    expect(preview.items).toHaveLength(1);
    // 150 needed at 100 per run rounds up, leaving 50 over.
    expect(preview.items[0]).toMatchObject({ runs: 2, spare: 50 });
    expect(preview.skipped.map((s) => s.name)).toEqual(['Sisters Core Probe Launcher']);
  });
});

describe('fitImportPlans', () => {
  const preview: FitToBuildPlansResult = previewFitImport(
    '[Buzzard, Max Hacker]\n\nScourge Fury Heavy Missile x150',
    CATALOG
  );

  function build(assumedMe = 2, assumedTe = 4) {
    return fitImportPlans(preview, {
      characterId: 1,
      catalog: CATALOG,
      ownedBlueprints: [],
      defaultsFrom: null,
      facilityDefaults: DEFAULT_FACILITY_DEFAULTS,
      assumedMe,
      assumedTe,
      buildGroupId: 'g1',
    });
  }

  it('creates one plan per buildable item, hull first', () => {
    const plans = build();
    expect(plans.map((p) => p.name)).toEqual(['Buzzard', 'Scourge Fury Heavy Missile']);
  });

  it('puts every plan in the group', () => {
    expect(build().every((p) => p.buildGroupId === 'g1')).toBe(true);
  });

  it('stamps the hull newer than every other member', () => {
    // `mostRecentlyUpdatedPlan` uses a strict `>`, so a batch sharing one
    // timestamp would resolve by UUID order and the pilot's next hand-made
    // plan would inherit its settings from a random rig (issue #456).
    const plans = build();
    const hull = plans[0];
    expect(plans.slice(1).every((p) => p.updatedAt < hull.updatedAt)).toBe(true);
  });

  it('carries the runs the fit implies', () => {
    expect(build().find((p) => p.name === 'Scourge Fury Heavy Missile')?.runs).toBe(2);
  });

  it('seeds ME from the assumed-ME preference rather than 0', () => {
    // Most of a T2 fit needs an invented BPC, which the app cannot see; at ME0
    // the group would overstate its material cost on nearly every member.
    expect(build(2).every((p) => p.me === 2)).toBe(true);
    expect(build(0).every((p) => p.me === 0)).toBe(true);
  });

  it('seeds TE from the assumed-TE preference rather than 0 (#634)', () => {
    // The same members, and the same reason on the other axis: at TE0 the
    // group's job time — and the ISK/hour read off it — is wrong by the
    // research a real invented BPC comes with.
    expect(build(2, 4).every((p) => p.te === 4)).toBe(true);
    expect(build(2, 0).every((p) => p.te === 0)).toBe(true);
  });

  it('skips a candidate whose blueprint has left the catalog', () => {
    const plans = fitImportPlans(
      { ...preview, hull: { ...preview.hull!, blueprintTypeID: 999999 } },
      {
        characterId: 1,
        catalog: CATALOG,
        ownedBlueprints: [],
        defaultsFrom: null,
        facilityDefaults: DEFAULT_FACILITY_DEFAULTS,
        assumedMe: 0,
        assumedTe: 0,
        buildGroupId: 'g1',
      }
    );
    expect(plans.map((p) => p.name)).toEqual(['Scourge Fury Heavy Missile']);
  });
});

describe('fitImportGroupName', () => {
  const labels = {
    withHull: (fit: string, ship: string) => `${fit} — ${ship}`,
    untitled: 'New group',
  };
  const base = { hull: null, items: [], skipped: [], excludedCharges: [], headerFailed: false };
  const hull = {
    blueprintTypeID: 1,
    productTypeID: 2,
    productName: 'Buzzard',
    quantity: 1,
    runs: 1,
    spare: 0,
  };

  it('names the group after both header names when it has both', () => {
    const preview: FitToBuildPlansResult = { ...base, hull, groupName: 'Max Hacker' };
    expect(fitImportGroupName(preview, labels)).toBe('Max Hacker — Buzzard');
  });

  it('falls back to the hull alone after a bare [Ship] header', () => {
    const preview: FitToBuildPlansResult = { ...base, hull, groupName: null };
    expect(fitImportGroupName(preview, labels)).toBe('Buzzard');
  });

  it('falls back to the fit name alone when the hull has no blueprint', () => {
    const preview: FitToBuildPlansResult = { ...base, groupName: 'Max Hacker' };
    expect(fitImportGroupName(preview, labels)).toBe('Max Hacker');
  });

  it('falls back to the generic name when the header could not be read', () => {
    const preview: FitToBuildPlansResult = { ...base, groupName: null, headerFailed: true };
    expect(fitImportGroupName(preview, labels)).toBe('New group');
  });
});

describe('applyFitImport', () => {
  const preview: FitToBuildPlansResult = previewFitImport(
    '[Buzzard, Max Hacker]\n\nScourge Fury Heavy Missile x150',
    CATALOG
  );

  function context(overrides: { buildGroups?: BuildGroupsValue } = {}) {
    return {
      characterId: 1,
      catalog: CATALOG,
      ownedBlueprints: [],
      defaultsFrom: null,
      facilityDefaults: DEFAULT_FACILITY_DEFAULTS,
      assumedMe: 2,
      assumedTe: 4,
      buildGroups: overrides.buildGroups ?? {},
      setBuildGroups: vi.fn<(value: BuildGroupsValue) => Promise<void>>(() => Promise.resolve()),
      groupName: 'Max Hacker (Buzzard)',
    };
  }

  beforeEach(async () => {
    await db.buildPlans.clear();
  });

  it('writes the group before the plans, and returns the new group id', async () => {
    const calls: string[] = [];
    const ctx = context();
    ctx.setBuildGroups.mockImplementation(async () => {
      calls.push('group');
    });
    const originalBulkAdd = db.buildPlans.bulkAdd.bind(db.buildPlans);
    const bulkAdd = vi.spyOn(db.buildPlans, 'bulkAdd').mockImplementation(((
      items: readonly BuildPlanRecord[]
    ) => {
      calls.push('plans');
      return originalBulkAdd(items);
    }) as typeof db.buildPlans.bulkAdd);

    const result = await applyFitImport(preview, ctx);

    expect(result).not.toBeNull();
    expect(calls).toEqual(['group', 'plans']);
    bulkAdd.mockRestore();
  });

  it('adds the group under the given name and character', async () => {
    const ctx = context();
    await applyFitImport(preview, ctx);
    const [value] = ctx.setBuildGroups.mock.calls[0];
    expect(buildGroupsFor(value, 1).map((g) => g.name)).toEqual(['Max Hacker (Buzzard)']);
  });

  it('persists every plan tagged with the new group id', async () => {
    const ctx = context();
    const result = await applyFitImport(preview, ctx);
    const stored = await db.buildPlans.toArray();
    expect(stored).toHaveLength(2);
    expect(stored.every((p) => p.buildGroupId === result?.groupId)).toBe(true);
  });

  it('writes nothing and returns null when the preview resolves to no buildable plans', async () => {
    const emptyPreview: FitToBuildPlansResult = {
      hull: null,
      items: [],
      skipped: [{ name: 'Sisters Core Probe Launcher', quantity: 1 }],
      excludedCharges: [],
      groupName: 'Empty Fit',
      headerFailed: false,
    };
    const ctx = context();
    const result = await applyFitImport(emptyPreview, ctx);
    expect(result).toBeNull();
    expect(ctx.setBuildGroups).not.toHaveBeenCalled();
    expect(await db.buildPlans.count()).toBe(0);
  });

  it('mints a fresh group id on every call, even for the same preview', async () => {
    const first = await applyFitImport(preview, context());
    const second = await applyFitImport(preview, context());
    expect(first?.groupId).not.toBe(second?.groupId);
  });
});
