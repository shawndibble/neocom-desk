import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NO_CHARACTER_MODIFIERS } from '@/engine/industry/characterModifiers';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@/i18n';
import { db } from '@/db';
import type { BlueprintCatalog } from './blueprintCatalog';
import type { OwnedStockSnapshot } from './ownedStockDetection';
import { DEFAULT_ACTIVITY_FACILITY_DEFAULTS } from './facilityDefaults';
import { OpportunitiesPanel } from './OpportunitiesPanel';

const loadCharacterBlueprints = vi.hoisted(() => vi.fn());
vi.mock('./data', async () => {
  const actual = await vi.importActual<typeof import('./data')>('./data');
  return { ...actual, loadCharacterBlueprints };
});

// `limit` lives in the hoisted object rather than a module-level const so the
// mock factory below — which vitest hoists above every other statement — and
// the assertion read the same number.
const loop = vi.hoisted(() => ({ count: 0, limit: 40 }));
const stub = vi.hoisted(() => ({ rows: [] as unknown[] }));

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
      manualRefreshOnly: false,
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
      <OpportunitiesPanel
        catalog={CATALOG}
        pi={null}
        modifiers={NO_CHARACTER_MODIFIERS}
        facilityDefaults={DEFAULT_ACTIVITY_FACILITY_DEFAULTS}
        activeCharacterId={CHARACTER_ID}
        ownedStockSnapshot={SNAPSHOT}
        onAddToCompare={() => {}}
        onAddToQuickbar={() => {}}
        quickbarAvailable
        onShowInfo={() => {}}
      />,
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
            iskPerHour: null,
            marginPct: null,
            profit: null,
            totalCost: 0,
            revenue: null,
          },
          orderDepth: 'deep',
        },
      ];
      const onAddToQuickbar = vi.fn();
      const onShowInfo = vi.fn();
      render(
        <OpportunitiesPanel
          catalog={catalog}
          pi={null}
          modifiers={NO_CHARACTER_MODIFIERS}
          facilityDefaults={DEFAULT_ACTIVITY_FACILITY_DEFAULTS}
          activeCharacterId={CHARACTER_ID}
          ownedStockSnapshot={SNAPSHOT}
          onAddToCompare={() => {}}
          onAddToQuickbar={onAddToQuickbar}
          quickbarAvailable
          onShowInfo={onShowInfo}
          {...handlers}
        />,
        { wrapper: MemoryRouter }
      );
      const name = await screen.findByText('Widget Alpha');
      return { row: name.closest('tr')!, onAddToQuickbar, onShowInfo };
    }

    it('opens the shared item menu from a row and wires its actions', async () => {
      const { row, onAddToQuickbar, onShowInfo } = await renderWithRow(1000);
      fireEvent.contextMenu(row);
      fireEvent.click(await screen.findByText('Add to Quickbar'));
      expect(onAddToQuickbar).toHaveBeenCalledWith(1000, 'Widget Alpha');

      fireEvent.contextMenu(row);
      fireEvent.click(await screen.findByText('Show info'));
      expect(onShowInfo).toHaveBeenCalledWith(1000, 'Widget Alpha');
    });

    it('renders a row with an unknown product type without a menu', async () => {
      const { row } = await renderWithRow(null);
      fireEvent.contextMenu(row);
      expect(screen.queryByText('Add to Quickbar')).toBeNull();
    });
  });
});
