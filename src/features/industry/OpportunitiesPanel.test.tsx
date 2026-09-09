import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import '@/i18n';
import { db } from '@/db';
import type { BlueprintCatalog } from './blueprintCatalog';
import type { OwnedStockSnapshot } from './ownedStockDetection';
import { DEFAULT_FACILITY_DEFAULTS } from './facilityDefaults';
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
      rows: [],
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
        skills={{}}
        facilityDefaults={DEFAULT_FACILITY_DEFAULTS}
        activeCharacterId={CHARACTER_ID}
        ownedStockSnapshot={SNAPSHOT}
        onAddToCompare={() => {}}
      />
    );

    await waitFor(() => expect(loadCharacterBlueprints).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(loop.count).toBeLessThan(loop.limit);

    const settled = loadCharacterBlueprints.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(loadCharacterBlueprints.mock.calls.length).toBe(settled);
  });
});
