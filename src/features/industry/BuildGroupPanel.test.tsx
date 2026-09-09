/**
 * The mixed-hub copy controls (issue #631). The rollup's per-hub split is
 * tested in `engine/industry/groupRollup.test.ts`; what is only testable here
 * is that each hub's button copies that hub's list and reports only itself as
 * copied — a single shared `copied` flag would say "copied" on all of them.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { BuildPlanRecord } from '@/db';
import type { BuildResult, MaterialCostLine } from '@/engine/industry/types';
import { configureClipboard } from '@/lib/clipboard';
import { BuildGroupPanel } from './BuildGroupPanel';
import type { BlueprintCatalog } from './blueprintCatalog';
import type { BuildGroup } from './buildGroups';
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
  return {
    planId,
    planName: `Plan ${planId}`,
    result: result(materials),
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

function renderPanel(plans: BuildPlanRecord[]) {
  render(
    <BuildGroupPanel
      group={GROUP}
      plans={plans}
      catalog={CATALOG}
      pi={null}
      ownedBlueprints={[]}
      skills={{} as never}
      ownedStockSnapshot={SNAPSHOT}
      onOpenPlan={() => {}}
      onRetarget={() => {}}
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
