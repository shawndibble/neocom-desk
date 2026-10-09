import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@/i18n';
import { db } from '@/db';
import type { BlueprintCatalog } from './blueprintCatalog';
import type { OwnedStockSnapshot } from './ownedStockDetection';
import { DEFAULT_ACTIVITY_FACILITY_DEFAULTS } from './facilityDefaults';
import { OpportunitiesPanel } from './OpportunitiesPanel';
import {
  OPPORTUNITIES_DEFAULT_COLUMNS,
  useVisibleOpportunitiesColumns,
} from './opportunitiesColumns';
import { fakeItemActions, withItemActions } from '@/features/market/__fixtures__/itemActions';

const loadCharacterBlueprints = vi.hoisted(() => vi.fn());
vi.mock('./data', async () => {
  const actual = await vi.importActual<typeof import('./data')>('./data');
  return { ...actual, loadCharacterBlueprints };
});

// `limit` lives in the hoisted object rather than a module-level const so the
// mock factory below — which vitest hoists above every other statement — and
// the assertion read the same number.
const loop = vi.hoisted(() => ({ count: 0, limit: 40 }));
const stub = vi.hoisted(() => ({
  rows: [] as unknown[],
  manualRefreshOnly: false,
  needsRefresh: false,
}));

vi.mock('@/lib/useIsDesktop', () => ({ useIsDesktop: () => true }));

// Stubbed out so this test isolates the panel's own blueprint-loading effect
// — the real hook does a market fetch and holds state of its own, neither of
// which is what the assertion below is about. The counter doubles as a
// circuit breaker: an effect whose deps change on every commit spins until
// the process is killed, so without the throw this test hangs rather than
// failing.
vi.mock('./useOpportunities', () => ({
  useOpportunities: () => {
    loop.count += 1;
    if (loop.count > loop.limit) {
      throw new Error(`OpportunitiesPanel re-rendered more than ${loop.limit} times — render loop`);
    }
    return {
      rows: stub.rows,
      loading: false,
      progress: { done: 0, total: 0 },
      manualRefreshOnly: stub.manualRefreshOnly,
      needsRefresh: stub.needsRefresh,
      refresh: () => {},
    };
  },
}));

const CHARACTER_ID = 91;

const CATALOG: BlueprintCatalog = {
  entries: [],
  byBlueprintTypeID: new Map(),
  byProductTypeID: new Map(),
  typesById: {} as unknown as BlueprintCatalog['typesById'],
};

const SNAPSHOT: OwnedStockSnapshot = {
  sources: [],
  characterNames: new Map(),
  incompleteCharacters: [],
};

beforeEach(async () => {
  loop.count = 0;
  stub.rows = [];
  stub.manualRefreshOnly = false;
  stub.needsRefresh = false;
  loadCharacterBlueprints.mockReset();
  loadCharacterBlueprints.mockResolvedValue({ cached: { data: [], fetchedAt: new Date() } });
  await db.characters.clear();
  await db.characters.put({
    characterId: CHARACTER_ID,
    name: 'Pilot One',
    ownerHash: 'oh-1',
    addedAt: Date.now(),
  });
});

describe('OpportunitiesPanel', () => {
  /**
   * Regression for the production render loop (React error #185): the default
   * `'current'` filter resolves to a *fresh* `Set` on every render, and that
   * identity used to reach `characterIds` and through it the dep array of the
   * blueprint-loading effect — so the effect re-fired on every commit and
   * render -> effect -> setState never settled.
   *
   * Asserted as "settles", not as an exact call count: one redundant load
   * still happens when `useLiveQuery` swaps its default `[]` for the real
   * roster, which is a separate, bounded issue this fix does not address.
   */
  it('settles instead of re-rendering unboundedly', async () => {
    render(
      withItemActions(
        <OpportunitiesPanel
          catalog={CATALOG}
          pi={null}
          facilityDefaults={DEFAULT_ACTIVITY_FACILITY_DEFAULTS}
          activeCharacterId={CHARACTER_ID}
          ownedStockSnapshot={SNAPSHOT}
          assumedMe={0}
          onAddToCompare={() => {}}
          onStartPlan={() => Promise.resolve(false)}
        />
      ),
      { wrapper: MemoryRouter }
    );

    await waitFor(() => expect(loadCharacterBlueprints).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(loop.count).toBeLessThan(loop.limit);

    const settled = loadCharacterBlueprints.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(loadCharacterBlueprints.mock.calls.length).toBe(settled);
  });

  describe('item context menu', () => {
    function entry(productTypeID: number | null, name: string) {
      return {
        blueprintTypeID: 900,
        blueprint: { activity: 'manufacturing', skills: [] },
        productTypeID,
        productName: name,
        productNameLower: name.toLowerCase(),
      };
    }

    async function renderWithRow(productTypeID: number | null, handlers = {}) {
      const e = entry(productTypeID, 'Widget Alpha');
      const catalog = {
        ...CATALOG,
        byBlueprintTypeID: new Map([[900, e]]),
      } as unknown as BlueprintCatalog;
      loadCharacterBlueprints.mockResolvedValue({
        cached: {
          data: [
            { item_id: 1, type_id: 900, runs: -1, material_efficiency: 0, time_efficiency: 0 },
          ],
          fetchedAt: new Date(),
        },
      });
      stub.rows = [
        {
          candidate: {
            id: `${CHARACTER_ID}:1`,
            characterId: CHARACTER_ID,
            characterName: 'Pilot One',
            blueprint: { item_id: 1, type_id: 900, runs: -1 },
            catalogEntry: e,
          },
          result: {
            seconds: 60,
            materials: [],
            iskPerHour: null,
            marginPct: null,
            profit: null,
            totalCost: 0,
            revenue: null,
          },
          orderDepth: 'deep',
        },
      ];
      const actions = fakeItemActions();
      render(
        withItemActions(
          <OpportunitiesPanel
            catalog={catalog}
            pi={null}
            facilityDefaults={DEFAULT_ACTIVITY_FACILITY_DEFAULTS}
            activeCharacterId={CHARACTER_ID}
            ownedStockSnapshot={SNAPSHOT}
            assumedMe={0}
            onAddToCompare={() => {}}
            onStartPlan={() => Promise.resolve(false)}
            {...handlers}
          />,
          actions
        ),
        { wrapper: MemoryRouter }
      );
      const name = await screen.findByText('Widget Alpha');
      return { row: name.closest('tr')!, actions };
    }

    it('renders the product name as plain text, not a link: the row click is Start plan', async () => {
      const { row } = await renderWithRow(1000);
      expect(within(row).queryByRole('link', { name: 'Widget Alpha' })).not.toBeInTheDocument();
      expect(within(row).getByText('Widget Alpha')).toBeInTheDocument();
    });

    it('starts with Blueprint, Time and Depth hidden; a ticked column shows', async () => {
      const { row } = await renderWithRow(1000);
      const table = row.closest('table')!;
      expect(screen.getByRole('button', { name: 'Columns' })).toBeInTheDocument();
      for (const name of ['Blueprint', 'Time', 'Depth']) {
        expect(within(table).queryByRole('columnheader', { name })).not.toBeInTheDocument();
      }
      act(() => useVisibleOpportunitiesColumns.setState({ value: ['duration'] }));
      expect(await within(table).findByRole('columnheader', { name: /Time/ })).toBeInTheDocument();
      act(() => useVisibleOpportunitiesColumns.setState({ value: OPPORTUNITIES_DEFAULT_COLUMNS }));
    });

    it('clicking the product name starts the plan, like the Plan button', async () => {
      const onStartPlan = vi.fn(() => Promise.resolve(false));
      const { row } = await renderWithRow(1000, { onStartPlan });
      fireEvent.click(within(row).getByText('Widget Alpha'));
      expect(onStartPlan).toHaveBeenCalledWith(entry(1000, 'Widget Alpha'));
    });

    it('the row checkbox does not start a plan', async () => {
      const onStartPlan = vi.fn(() => Promise.resolve(false));
      const { row } = await renderWithRow(1000, { onStartPlan });
      fireEvent.click(within(row).getByRole('checkbox'));
      expect(onStartPlan).not.toHaveBeenCalled();
    });

    it('offers Price history in the row menu and a More-actions button, as the phone card does', async () => {
      const { row } = await renderWithRow(1000);
      expect(within(row).getByRole('button', { name: /More actions/ })).toBeInTheDocument();
      fireEvent.contextMenu(row);
      expect(await screen.findByRole('menuitem', { name: 'Price history' })).toBeInTheDocument();
    });

    it('gives the row a "Plan" button that fires onStartPlan with its catalog entry (issue #1781)', async () => {
      const onStartPlan = vi.fn(() => Promise.resolve(false));
      const { row } = await renderWithRow(1000, { onStartPlan });
      fireEvent.click(within(row).getByRole('button', { name: 'Plan' }));
      expect(onStartPlan).toHaveBeenCalledWith(entry(1000, 'Widget Alpha'));
    });
  });

  it('shows a needs-Refresh state instead of rows when pricing inputs changed (issue #2056)', async () => {
    const catalog = {
      ...CATALOG,
      byBlueprintTypeID: new Map([
        [
          900,
          {
            blueprintTypeID: 900,
            blueprint: { activity: 'manufacturing', skills: [] },
            productTypeID: 1000,
            productName: 'Widget Alpha',
            productNameLower: 'widget alpha',
          },
        ],
      ]),
    } as unknown as BlueprintCatalog;
    loadCharacterBlueprints.mockResolvedValue({
      cached: {
        data: [{ item_id: 1, type_id: 900, runs: -1, material_efficiency: 0, time_efficiency: 0 }],
        fetchedAt: new Date(),
      },
    });
    stub.manualRefreshOnly = true;
    stub.needsRefresh = true;
    render(
      withItemActions(
        <OpportunitiesPanel
          catalog={catalog}
          pi={null}
          facilityDefaults={DEFAULT_ACTIVITY_FACILITY_DEFAULTS}
          activeCharacterId={CHARACTER_ID}
          ownedStockSnapshot={SNAPSHOT}
          assumedMe={0}
          onAddToCompare={() => {}}
          onStartPlan={() => Promise.resolve(false)}
        />
      ),
      { wrapper: MemoryRouter }
    );

    expect(await screen.findByText('Pricing settings changed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
    expect(screen.getByText(/More than 10 blueprints/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  describe('Compare button (issue #1781)', () => {
    function candidateRow(id: string, name: string) {
      const e = {
        blueprintTypeID: 900,
        blueprint: { activity: 'manufacturing', skills: [] },
        productTypeID: 1000,
        productName: name,
        productNameLower: name.toLowerCase(),
      };
      return {
        candidate: {
          id,
          characterId: CHARACTER_ID,
          characterName: 'Pilot One',
          blueprint: { item_id: 1, type_id: 900, runs: -1 },
          catalogEntry: e,
        },
        result: {
          seconds: 60,
          materials: [],
          iskPerHour: null,
          marginPct: null,
          profit: null,
          totalCost: 0,
          revenue: null,
        },
        orderDepth: 'deep',
      };
    }

    it('stays hidden with a single row selected, and appears once a second joins it', async () => {
      const rowA = candidateRow(`${CHARACTER_ID}:1`, 'Widget Alpha');
      const rowB = candidateRow(`${CHARACTER_ID}:2`, 'Widget Beta');
      stub.rows = [rowA, rowB];
      const catalog = {
        ...CATALOG,
        byBlueprintTypeID: new Map([[900, rowA.candidate.catalogEntry]]),
      } as unknown as BlueprintCatalog;
      loadCharacterBlueprints.mockResolvedValue({
        cached: {
          data: [
            { item_id: 1, type_id: 900, runs: -1, material_efficiency: 0, time_efficiency: 0 },
          ],
          fetchedAt: new Date(),
        },
      });
      render(
        withItemActions(
          <OpportunitiesPanel
            catalog={catalog}
            pi={null}
            facilityDefaults={DEFAULT_ACTIVITY_FACILITY_DEFAULTS}
            activeCharacterId={CHARACTER_ID}
            ownedStockSnapshot={SNAPSHOT}
            assumedMe={0}
            onAddToCompare={() => {}}
            onStartPlan={() => Promise.resolve(false)}
          />
        ),
        { wrapper: MemoryRouter }
      );

      const first = await screen.findByRole('checkbox', {
        name: 'Select Widget Alpha to compare plans',
      });
      const second = screen.getByRole('checkbox', { name: 'Select Widget Beta to compare plans' });

      fireEvent.click(first);
      expect(screen.queryByRole('button', { name: /Add \d+ to Compare/ })).not.toBeInTheDocument();

      fireEvent.click(second);
      expect(screen.getByRole('button', { name: 'Add 2 to Compare' })).toBeInTheDocument();
    });
  });
});
