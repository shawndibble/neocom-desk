import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { CharacterAsset, CharacterBlueprint } from '@/esi/endpoints';
import type { BlueprintCatalog, BlueprintCatalogEntry } from './blueprintCatalog';
import type { OpportunityRow } from './opportunities';
import type { OwnedStockSnapshot } from './ownedStockDetection';
import { OwnedBlueprintsPanel } from './OwnedBlueprintsPanel';

vi.mock('@/lib/useIsDesktop', () => ({ useIsDesktop: () => true }));

const loadBlueprintLocation = vi.hoisted(() => vi.fn());
vi.mock('@/features/bpcContracts/blueprintLocation', () => ({ loadBlueprintLocation }));

const corp = vi.hoisted(() => ({
  state: { blueprints: [] as CharacterBlueprint[], available: false, incomplete: false },
}));
vi.mock('./corpOwnedBlueprints', () => ({ useCorpOwnedBlueprints: () => corp.state }));

const CHARACTER_ID = 91;

function bp(overrides: Partial<CharacterBlueprint>): CharacterBlueprint {
  return {
    item_id: 1,
    type_id: 100,
    runs: -1,
    material_efficiency: 10,
    time_efficiency: 20,
    quantity: -1,
    location_id: 60003760,
    location_flag: 'Hangar',
    ...overrides,
  };
}

function entry(id: number, productName: string, activity: string): BlueprintCatalogEntry {
  return {
    blueprintTypeID: id,
    blueprint: { activity },
    productTypeID: id + 1,
    productName,
    productNameLower: productName.toLowerCase(),
  } as unknown as BlueprintCatalogEntry;
}

const RIFTER = entry(100, 'Rifter', 'manufacturing');
const CATALOG = {
  entries: [],
  byBlueprintTypeID: new Map([
    [100, RIFTER],
    [200, entry(200, 'Fullerides', 'reaction')],
  ]),
  byProductTypeID: new Map(),
  typesById: {
    '100': { name: 'Rifter Blueprint' },
    '200': { name: 'Fullerides Reaction Formula' },
    '300': { name: 'Merlin Blueprint' },
  },
} as unknown as BlueprintCatalog;

const CONTAINER: CharacterAsset = {
  item_id: 5000,
  type_id: 3,
  quantity: 1,
  location_id: 60008494,
  location_type: 'station',
  location_flag: 'Hangar',
  is_singleton: true,
};
const SNAPSHOT: OwnedStockSnapshot = {
  sources: [{ characterId: CHARACTER_ID, assets: [CONTAINER] }],
  characterNames: new Map(),
  incompleteCharacters: [],
};

const OWNED = new Map([
  [
    CHARACTER_ID,
    [
      bp({ item_id: 11, type_id: 100 }),
      bp({ item_id: 12, type_id: 200, runs: 15, quantity: -2, location_id: 5000 }),
      bp({
        item_id: 13,
        type_id: 300,
        runs: 4,
        quantity: -2,
        location_id: 9999,
        location_flag: 'Unlocked',
      }),
    ],
  ],
]);
const RANKED = [
  { candidate: { id: `${CHARACTER_ID}:11` }, result: { iskPerHour: 1_234_567 } },
] as unknown as OpportunityRow[];

function renderPanel(onStartPlan = vi.fn(() => Promise.resolve(false))) {
  render(
    <OwnedBlueprintsPanel
      catalog={CATALOG}
      activeCharacterId={CHARACTER_ID}
      ownedByCharacter={OWNED}
      characterNames={new Map([[CHARACTER_ID, 'Pilot One']])}
      rankedRows={RANKED}
      ownedStockSnapshot={SNAPSHOT}
      loading={false}
      meta={null}
      pricingActions={null}
      onStartPlan={onStartPlan}
    />,
    { wrapper: MemoryRouter }
  );
  return onStartPlan;
}

beforeEach(() => {
  corp.state = { blueprints: [], available: false, incomplete: false };
  localStorage.clear();
  loadBlueprintLocation.mockReset();
  loadBlueprintLocation.mockImplementation((_c: number, locationId: number) =>
    Promise.resolve({
      name:
        locationId === 60003760
          ? 'Jita IV - Moon 4'
          : locationId === 60008494
            ? 'Amarr VIII'
            : null,
      regionId: null,
      space: null,
      systemId: null,
    })
  );
});

describe('OwnedBlueprintsPanel', () => {
  it('lists every owned blueprint, reactions and uncatalogued ones included, with locations', async () => {
    renderPanel();
    expect(screen.getByText('Rifter Blueprint')).toBeInTheDocument();
    expect(screen.getByText('Fullerides Reaction Formula')).toBeInTheDocument();
    expect(screen.getByText('Merlin Blueprint')).toBeInTheDocument();
    expect(await screen.findByText('Jita IV - Moon 4')).toBeInTheDocument();
    // Walked up through the cached container to its station.
    expect(await screen.findByText('Amarr VIII')).toBeInTheDocument();
    expect(screen.getByText('In container')).toBeInTheDocument();
  });

  it('filters by BPO/BPC and activity', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole('button', { name: 'BPO' }));
    expect(screen.getByText('Rifter Blueprint')).toBeInTheDocument();
    expect(screen.queryByText('Merlin Blueprint')).not.toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'All' })[0]!);
    await user.click(screen.getByRole('button', { name: 'Reaction' }));
    expect(screen.getByText('Fullerides Reaction Formula')).toBeInTheDocument();
    expect(screen.queryByText('Rifter Blueprint')).not.toBeInTheDocument();
  });

  it('searches by name', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.type(screen.getByRole('searchbox', { name: 'Search blueprints' }), 'merlin');
    await waitFor(() => expect(screen.queryByText('Rifter Blueprint')).not.toBeInTheDocument());
    expect(screen.getByText('Merlin Blueprint')).toBeInTheDocument();
  });

  it('starts a plan from a catalogued row only', async () => {
    const user = userEvent.setup();
    const onStartPlan = renderPanel();
    const buttons = screen.getAllByRole('button', { name: 'Start a plan' });
    // Merlin isn't in the catalog, so it has nothing to plan.
    expect(buttons).toHaveLength(2);
    const rifterRow = screen.getByText('Rifter Blueprint').closest('tr')!;
    await user.click(within(rifterRow).getByRole('button', { name: 'Start a plan' }));
    expect(onStartPlan).toHaveBeenCalledWith(RIFTER);
  });

  it('hides the corp toggle without corp blueprint access', () => {
    renderPanel();
    expect(screen.queryByRole('button', { name: 'Corp blueprints' })).not.toBeInTheDocument();
  });

  it('adds corp blueprints under the toggle for a Character with access', async () => {
    const user = userEvent.setup();
    corp.state = {
      blueprints: [bp({ item_id: 21, type_id: 100, runs: 9, quantity: -2 })],
      available: true,
      incomplete: false,
    };
    renderPanel();
    expect(screen.queryByText('Corporation')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Corp blueprints' }));
    expect(screen.getByText('Corporation')).toBeInTheDocument();
  });
});
