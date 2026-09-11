/**
 * The mixed-hub copy controls (issue #631). The rollup's per-hub split is
 * tested in `engine/industry/groupRollup.test.ts`; what is only testable here
 * is that each hub's button copies that hub's list and reports only itself as
 * copied — a single shared `copied` flag would say "copied" on all of them.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { BuildPlanRecord } from '@/db';
import type { SweepStrategy } from '@/engine/industry/autoMakeOrBuy';
import type { BuildResult, MaterialCostLine } from '@/engine/industry/types';
import { configureClipboard } from '@/lib/clipboard';
import { BuildGroupPanel } from './BuildGroupPanel';
import type { BlueprintCatalog, BlueprintCatalogEntry } from './blueprintCatalog';
import type { BuildGroup } from './buildGroups';
import type { DepthChoice } from './CraftSweepControl';
import type { OwnedStockSnapshot } from './ownedStockDetection';
import { useComparedBuildResults, type ComparedBuildRow } from './useComparedBuildResults';

vi.mock('./useComparedBuildResults', async () => {
  const actual = await vi.importActual<typeof import('./useComparedBuildResults')>(
    './useComparedBuildResults'
  );
  return { ...actual, useComparedBuildResults: vi.fn() };
});

const mockedUseComparedBuildResults = vi.mocked(useComparedBuildResults);

const CATALOG: BlueprintCatalog = {
  entries: [],
  byBlueprintTypeID: new Map(),
  byProductTypeID: new Map(),
  typesById: {
    '34': { name: 'Tritanium' },
    '35': { name: 'Pyerite' },
  } as unknown as BlueprintCatalog['typesById'],
};

const SNAPSHOT: OwnedStockSnapshot = {
  sources: [],
  characterNames: new Map(),
  incompleteCharacters: [],
};

const GROUP: BuildGroup = { id: 'g1', name: 'Rifter fit' } as BuildGroup;

// A two-level chain so Sweep Depth has something to size to: every fixture
// plan's `blueprintTypeID` is 1 (see `plan()` below), producing 100 from
// material 2, and 2 is itself producible from 3 — depth 1.
const PRODUCT_ENTRY: BlueprintCatalogEntry = {
  blueprintTypeID: 1,
  blueprint: {
    name: 'Product',
    time: 1,
    materials: [{ typeID: 2, quantity: 1 }],
    products: [{ typeID: 100, quantity: 1 }],
    skills: [],
    activity: 'manufacturing',
  },
  productTypeID: 100,
  productName: 'Product',
  productNameLower: 'product',
};
const SUB_ENTRY: BlueprintCatalogEntry = {
  blueprintTypeID: 2,
  blueprint: {
    name: 'Sub',
    time: 1,
    materials: [],
    products: [{ typeID: 2, quantity: 1 }],
    skills: [],
    activity: 'manufacturing',
  },
  productTypeID: 2,
  productName: 'Sub',
  productNameLower: 'sub',
};
const CHAIN_CATALOG: BlueprintCatalog = {
  entries: [PRODUCT_ENTRY, SUB_ENTRY],
  byBlueprintTypeID: new Map([
    [1, PRODUCT_ENTRY],
    [2, SUB_ENTRY],
  ]),
  byProductTypeID: new Map([
    [100, PRODUCT_ENTRY],
    [2, SUB_ENTRY],
  ]),
  typesById: {},
};

function plan(id: string, hubId: string): BuildPlanRecord {
  return {
    id,
    characterId: 1,
    name: `Plan ${id}`,
    blueprintTypeID: 1,
    runs: 1,
    me: 0,
    te: 0,
    facility: 'npcStation',
    rigLevel: 'none',
    security: 'highsec',
    hubId,
    updatedAt: 0,
  } as BuildPlanRecord;
}

function material(typeID: number, quantity: number, remaining = quantity): MaterialCostLine {
  return {
    typeID,
    baseQuantity: quantity,
    quantity,
    ownedQuantity: quantity - remaining,
    remainingQuantity: remaining,
    unitPrice: 10,
    lineCost: remaining * 10,
    unpriced: false,
  };
}

/**
 * A material the plan is building rather than buying — `resolveMaterial`
 * would attach a real `subBuild`; the group panel only ever checks
 * `subBuilds.length > 0` (never opens the "Build it" modal from this list),
 * so a minimal stub is enough to exercise the built/bought branch.
 */
function builtMaterial(typeID: number, quantity: number): MaterialCostLine {
  return {
    ...material(typeID, quantity),
    unitPrice: null,
    subBuild: { inputs: [] },
  } as MaterialCostLine;
}

function result(materials: MaterialCostLine[]): BuildResult {
  return {
    materials: materials.map((m) => ({ ...m, children: [], decision: 'buy' })),
    seconds: 100,
    jobFee: { eiv: 0, grossCost: 0, sccSurcharge: 0, facilityTax: 0, total: 5 },
    materialCost: 100,
    totalCost: 105,
    buyCost: 200,
    unpricedMaterials: [],
    unpriceable: false,
    recommendation: 'build',
  } as unknown as BuildResult;
}

function row(planId: string, materials: MaterialCostLine[]): ComparedBuildRow {
  const builtResult = result(materials);
  return {
    planId,
    planName: `Plan ${planId}`,
    result: builtResult,
    // The rollup reads `groupResult` (issue #697) — these fixtures have no
    // owned-stock ledger in play, so the owned-disabled tree is the same
    // materials the plan-level `result` already carries.
    groupResult: builtResult,
    loading: false,
    error: null,
  } as ComparedBuildRow;
}

function renderMixedGroup() {
  const written: string[] = [];
  configureClipboard(async (text) => {
    written.push(text);
  });
  mockedUseComparedBuildResults.mockReturnValue([
    row('a', [material(34, 100)]),
    row('b', [material(35, 50)]),
  ]);
  renderPanel([plan('a', 'jita'), plan('b', 'amarr')]);
  return written;
}

function renderPanel(
  plans: BuildPlanRecord[],
  overrides: {
    group?: BuildGroup;
    catalog?: BlueprintCatalog;
    onCraftSweep?: (options: {
      strategy: SweepStrategy;
      depth: number;
      depthChoice: DepthChoice;
    }) => Promise<void>;
    onOwnedStockChange?: (ownedStock: Record<number, number>) => void;
  } = {}
) {
  render(
    <BuildGroupPanel
      group={overrides.group ?? GROUP}
      plans={plans}
      catalog={overrides.catalog ?? CATALOG}
      pi={null}
      ownedBlueprints={[]}
      skills={{} as never}
      ownedStockSnapshot={SNAPSHOT}
      onCraftSweep={overrides.onCraftSweep ?? (() => Promise.resolve())}
      onOpenPlan={() => {}}
      onRetarget={() => {}}
      onOwnedStockChange={overrides.onOwnedStockChange ?? (() => {})}
      onOwnedStockScopeChange={() => {}}
    />
  );
}

function loadingRow(planId: string): ComparedBuildRow {
  return {
    planId,
    planName: `Plan ${planId}`,
    result: null,
    loading: true,
    error: null,
  } as ComparedBuildRow;
}

describe('BuildGroupPanel — mixed-hub multibuy', () => {
  afterEach(() => configureClipboard(null));

  it('offers one copy control per hub, each pasting that hub’s list alone', async () => {
    const written = renderMixedGroup();

    await userEvent.click(screen.getByRole('button', { name: 'Copy Jita list' }));
    expect(written).toEqual(['Tritanium	100']);

    await userEvent.click(screen.getByRole('button', { name: 'Copy Amarr list' }));
    expect(written).toEqual(['Tritanium	100', 'Pyerite	50']);
  });

  it('reports only the hub actually copied as copied', async () => {
    renderMixedGroup();

    await userEvent.click(screen.getByRole('button', { name: 'Copy Jita list' }));

    expect(screen.getByRole('button', { name: 'Jita list copied' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy Amarr list' })).toBeTruthy();
  });

  it('leaves the whole-group control disabled — no one list covers both hubs', () => {
    renderMixedGroup();

    const groupCopy = screen.getByRole('button', { name: 'Copy shopping list for multibuy' });
    expect((groupCopy as HTMLButtonElement).disabled).toBe(true);
  });

  it('says the clipboard refused rather than reporting a copy that never happened', async () => {
    configureClipboard(async () => {
      throw new Error('denied');
    });
    mockedUseComparedBuildResults.mockReturnValue([
      row('a', [material(34, 100)]),
      row('b', [material(35, 50)]),
    ]);
    renderPanel([plan('a', 'jita'), plan('b', 'amarr')]);

    await userEvent.click(screen.getByRole('button', { name: 'Copy Jita list' }));

    expect(screen.getByText(/reach the clipboard/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy Jita list' })).toBeTruthy();
  });

  it('waits for a hub’s own members, without holding up the other hub', () => {
    // An unsettled member contributes nothing to the rollup, so Jita's list is
    // short its units until Plan b lands — but Amarr's is already whole.
    configureClipboard(async () => {});
    mockedUseComparedBuildResults.mockReturnValue([
      row('a', [material(34, 100)]),
      loadingRow('b'),
      row('c', [material(35, 50)]),
    ]);
    renderPanel([plan('a', 'jita'), plan('b', 'jita'), plan('c', 'amarr')]);

    expect(
      (screen.getByRole('button', { name: 'Copy Jita list' }) as HTMLButtonElement).disabled
    ).toBe(true);
    expect(
      (screen.getByRole('button', { name: 'Copy Amarr list' }) as HTMLButtonElement).disabled
    ).toBe(false);
  });

  it('disables a hub whose materials are all owned rather than copying nothing', () => {
    configureClipboard(async () => {});
    mockedUseComparedBuildResults.mockReturnValue([
      row('a', [material(34, 100)]),
      row('b', [material(35, 50, 0)]),
    ]);
    renderPanel([plan('a', 'jita'), plan('b', 'amarr')]);

    expect(
      (screen.getByRole('button', { name: 'Copy Amarr list' }) as HTMLButtonElement).disabled
    ).toBe(true);
    expect(
      (screen.getByRole('button', { name: 'Copy Jita list' }) as HTMLButtonElement).disabled
    ).toBe(false);
  });
});

describe('BuildGroupPanel — Craft Sweep (issue #696)', () => {
  it("pre-fills Sweep Strategy from the group's persisted default", () => {
    mockedUseComparedBuildResults.mockReturnValue([row('a', [material(34, 100)])]);
    renderPanel([plan('a', 'jita')], {
      catalog: CHAIN_CATALOG,
      group: { ...GROUP, craftSweepDefault: { strategy: 'build', depthChoice: 'all' } },
    });

    expect(screen.getByRole('combobox', { name: 'Sweep Strategy' }).textContent).toBe('Build');
  });

  it('names how many plans it will affect, and applies with the chosen options', async () => {
    const user = userEvent.setup();
    mockedUseComparedBuildResults.mockReturnValue([row('a', [material(34, 100)])]);
    const onCraftSweep = vi.fn().mockResolvedValue(undefined);
    renderPanel([plan('a', 'jita')], { catalog: CHAIN_CATALOG, onCraftSweep });

    await user.click(screen.getByRole('button', { name: 'Apply Craft Sweep' }));
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(
        'This will overwrite craft/buy choices on 1 plan in this group — continue?'
      )
    ).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Apply Craft Sweep' }));

    expect(onCraftSweep).toHaveBeenCalledWith({
      strategy: 'cost-effective',
      depth: 1,
      depthChoice: 'all',
    });
  });

  it('counts only members whose blueprint still resolves in the catalog, not every plan in the group', async () => {
    const user = userEvent.setup();
    mockedUseComparedBuildResults.mockReturnValue([
      row('a', [material(34, 100)]),
      row('orphan', [material(35, 10)]),
    ]);
    renderPanel([plan('a', 'jita'), { ...plan('orphan', 'jita'), blueprintTypeID: 999 }], {
      catalog: CHAIN_CATALOG,
    });

    await user.click(screen.getByRole('button', { name: 'Apply Craft Sweep' }));
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(
        'This will overwrite craft/buy choices on 1 plan in this group — continue?'
      )
    ).toBeTruthy();
  });
});

describe('BuildGroupPanel — Group Owned Overlay (issue #697)', () => {
  it('commits a typed owned quantity into the group ledger, leaving the rest of it alone', async () => {
    const user = userEvent.setup();
    mockedUseComparedBuildResults.mockReturnValue([row('a', [material(34, 100)])]);
    const onOwnedStockChange = vi.fn();
    renderPanel([plan('a', 'jita')], {
      group: { ...GROUP, ownedStock: { 35: 7 } },
      onOwnedStockChange,
    });

    const input = screen.getByRole('textbox', { name: 'Owned quantity of Tritanium' });
    await user.type(input, '50');
    await user.tab();

    expect(onOwnedStockChange).toHaveBeenCalledWith({ 35: 7, 34: 50 });
  });
});

describe('BuildGroupPanel — built materials in the group needs list (issue #802)', () => {
  it('labels a material the plan is building as Built, not a buy count', () => {
    mockedUseComparedBuildResults.mockReturnValue([row('a', [builtMaterial(999, 1)])]);
    renderPanel([plan('a', 'jita')]);

    const needsPanel = screen.getByText('Everything this group needs').closest('section')!;
    expect(within(needsPanel).getByText('Built')).toBeTruthy();
    expect(within(needsPanel).queryByText('1 to buy of 1')).toBeNull();
  });

  it('still shows a genuine buy line as a buy count, unaffected by a built row elsewhere', () => {
    mockedUseComparedBuildResults.mockReturnValue([
      row('a', [builtMaterial(999, 1), material(34, 100)]),
    ]);
    renderPanel([plan('a', 'jita')]);

    const needsPanel = screen.getByText('Everything this group needs').closest('section')!;
    expect(within(needsPanel).getByText('100 to buy of 100')).toBeTruthy();
  });

  it('nets out the built portion when one member builds a type and another buys the same one', () => {
    // Member a builds 10 of type 999 as its own sub-job; member b needs 5 more
    // of the same type as a plain material. The group still has to buy 5 —
    // neither "Built" (some of it genuinely isn't) nor "15 to buy" (10 of
    // those 15 are already spoken for by a's build) is correct.
    mockedUseComparedBuildResults.mockReturnValue([
      row('a', [builtMaterial(999, 10)]),
      row('b', [material(999, 5)]),
    ]);
    renderPanel([plan('a', 'jita'), plan('b', 'jita')]);

    const needsPanel = screen.getByText('Everything this group needs').closest('section')!;
    expect(within(needsPanel).getByText('5 to buy of 15')).toBeTruthy();
  });
});
