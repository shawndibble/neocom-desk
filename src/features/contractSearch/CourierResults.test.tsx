import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { CourierResults } from '@/features/contractSearch/CourierResults';
import type { CourierEndpoint, CourierRouteRow } from '@/engine/contracts/courierSearch';
import { NARROW_QUERY } from '@/lib/useIsNarrow';
import { stubViewport } from '@/test/viewport';
import { PHONE_QUERY } from '@/lib/useIsPhone';
import { localJumpCountsForRoutes } from '@/features/route/localRoute';
import {
  useCourierFilterPref,
  DEFAULT_COURIER_FILTER,
} from '@/features/contractSearch/courierFilterPref';

const loadCharacterRegionId = vi.fn<(characterId: number) => Promise<number | null>>();
vi.mock('@/features/contractSearch/characterRegion', () => ({
  loadCharacterRegionId: (characterId: number) => loadCharacterRegionId(characterId),
}));

vi.mock('@/features/route/localRoute', () => ({
  localJumpCountsForRoutes: vi.fn(async () => ({ kind: 'unknown' })),
}));

const CHARACTER_ID = 42;
const THE_FORGE = 10000002;
const DOMAIN = 10000043;

function endpoint(regionId: number, name: string): CourierEndpoint {
  return {
    locationId: 60003760,
    name,
    systemName: 'Jita',
    systemId: 30000142,
    regionId,
    security: 0.9459,
    space: 'highsec',
    resolution: 'station',
    hasStargates: true,
  };
}

const ROWS: readonly CourierRouteRow[] = [
  {
    contractId: 1,
    regionId: THE_FORGE,
    originLocationId: 60003760,
    destinationLocationId: 60008494,
    reward: 5_000_000,
    volume: 1_000,
    dateExpired: Date.now() + 86_400_000,
    origin: endpoint(THE_FORGE, 'Jita IV - Moon 4'),
    destination: endpoint(DOMAIN, 'Amarr VIII'),
  },
];

const REGION_NAMES = new Map([
  [THE_FORGE, 'The Forge'],
  [DOMAIN, 'Domain'],
]);

async function openFilters(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /^Filters/ }));
}

function renderBoard(characterId = CHARACTER_ID, initialEntries: string[] = ['/']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <CourierResults rows={ROWS} regionNames={REGION_NAMES} characterId={characterId} />
    </MemoryRouter>
  );
}

const myRegionButton = () => screen.getByRole('button', { name: 'From my region' });

async function pressMyRegion(user: ReturnType<typeof userEvent.setup>) {
  if (!screen.queryByRole('button', { name: 'From my region' })) {
    await user.click(screen.getByRole('combobox', { name: 'From region' }));
  }
  await user.click(myRegionButton());
}

beforeEach(() => {
  loadCharacterRegionId.mockReset();
  vi.mocked(localJumpCountsForRoutes).mockResolvedValue({ kind: 'unknown' });
  useCourierFilterPref.setState({ value: DEFAULT_COURIER_FILTER, hydrated: true });
});

describe('CourierResults column picker', () => {
  it('shows every column by default, so shipping the picker changes nothing on its own', async () => {
    renderBoard();
    const table = await screen.findByRole('table', { name: 'Courier Contract Search' });
    for (const name of [
      'Route',
      'Reward',
      'Collateral',
      'Jumps',
      'ISK/jump',
      'ISK/m³',
      'Expires',
    ]) {
      expect(within(table).getByRole('columnheader', { name })).toBeInTheDocument();
    }
  });

  it('can hide and re-show a column via the column picker, leaving Route (the identity column) untouched', async () => {
    const user = userEvent.setup();
    renderBoard();
    const table = await screen.findByRole('table', { name: 'Courier Contract Search' });
    await screen.findByRole('columnheader', { name: 'Collateral' });

    await user.click(screen.getByRole('button', { name: 'Columns' }));
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'Collateral' }));
    await user.keyboard('{Escape}');

    expect(
      within(table).queryByRole('columnheader', { name: 'Collateral' })
    ).not.toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Route' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Jumps' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Columns' }));
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'Collateral' }));
    await user.keyboard('{Escape}');

    expect(within(table).getByRole('columnheader', { name: 'Collateral' })).toBeInTheDocument();
  });
});

describe('CourierResults destination space key filter', () => {
  it('sits in the row with no pill, and is not repeated in the open box', async () => {
    const user = userEvent.setup();
    renderBoard();
    expect(await screen.findByRole('group', { name: 'Destination space' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Change filter: Destination space/ })).toBeNull();
    await openFilters(user);
    expect(screen.getAllByRole('group', { name: 'Destination space' })).toHaveLength(1);
  });

  it('moves into the sheet when narrow', async () => {
    const restore = stubViewport(NARROW_QUERY);
    try {
      const user = userEvent.setup();
      renderBoard();
      await screen.findByRole('table', { name: 'Courier Contract Search' });
      expect(screen.queryByRole('group', { name: 'Destination space' })).toBeNull();
      await openFilters(user);
      expect(await screen.findByRole('group', { name: 'Destination space' })).toBeInTheDocument();
    } finally {
      restore();
    }
  });
});

describe('CourierResults "From my region" shortcut', () => {
  it('costs nothing until it is pressed', async () => {
    loadCharacterRegionId.mockResolvedValue(THE_FORGE);
    const user = userEvent.setup();
    renderBoard();

    await openFilters(user);
    await user.click(screen.getByRole('combobox', { name: 'From region' }));

    expect(myRegionButton()).toBeInTheDocument();
    expect(loadCharacterRegionId).not.toHaveBeenCalled();
  });

  it('asks once however fast it is pressed twice', async () => {
    let release: (regionId: number) => void = () => {};
    loadCharacterRegionId.mockReturnValue(
      new Promise<number | null>((resolve) => {
        release = resolve;
      })
    );
    const user = userEvent.setup();
    renderBoard();
    await openFilters(user);

    await pressMyRegion(user);
    await waitFor(() => expect(myRegionButton()).toBeDisabled());
    await user.click(myRegionButton());
    release(THE_FORGE);

    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'From region' })).toHaveTextContent('The Forge')
    );
    expect(loadCharacterRegionId).toHaveBeenCalledTimes(1);
  });

  it('sets the origin region filter from the character location', async () => {
    loadCharacterRegionId.mockResolvedValue(THE_FORGE);
    const user = userEvent.setup();
    renderBoard();
    await openFilters(user);

    await pressMyRegion(user);

    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'From region' })).toHaveTextContent('The Forge')
    );
  });

  it('never sets a region the dropdown has no option for, and says why', async () => {
    loadCharacterRegionId.mockResolvedValue(DOMAIN);
    const user = userEvent.setup();
    renderBoard();
    await openFilters(user);

    await pressMyRegion(user);

    expect(await screen.findByText('No hauls start in your region')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'From my region' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'From region' })).toHaveTextContent('All regions');
  });

  it('goes quietly unavailable when the location cannot be resolved', async () => {
    loadCharacterRegionId.mockResolvedValue(null);
    const user = userEvent.setup();
    renderBoard();
    await openFilters(user);

    await pressMyRegion(user);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'From my region' })).toBeDisabled()
    );
    await waitFor(() =>
      expect(screen.getAllByText('Your current location is unavailable')).toHaveLength(2)
    );
    expect(screen.queryByText('No hauls start in your region')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'From region' })).toHaveTextContent('All regions');
  });

  it('keeps the answer when the filter bar is collapsed and reopened', async () => {
    loadCharacterRegionId.mockResolvedValue(THE_FORGE);
    const user = userEvent.setup();
    renderBoard();
    await openFilters(user);
    await pressMyRegion(user);
    await waitFor(() => expect(loadCharacterRegionId).toHaveBeenCalledTimes(1));

    await openFilters(user);
    await openFilters(user);
    await pressMyRegion(user);

    expect(loadCharacterRegionId).toHaveBeenCalledTimes(1);
  });

  it('re-resolves when the active character changes', async () => {
    loadCharacterRegionId.mockResolvedValue(DOMAIN);
    const user = userEvent.setup();
    const { rerender } = renderBoard();
    await openFilters(user);
    await pressMyRegion(user);
    await waitFor(() => expect(myRegionButton()).toBeDisabled());

    loadCharacterRegionId.mockResolvedValue(THE_FORGE);
    rerender(
      <MemoryRouter>
        <CourierResults rows={ROWS} regionNames={REGION_NAMES} characterId={CHARACTER_ID + 1} />
      </MemoryRouter>
    );

    await waitFor(() => expect(myRegionButton()).toBeEnabled());
    await pressMyRegion(user);
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'From region' })).toHaveTextContent('The Forge')
    );
    expect(loadCharacterRegionId).toHaveBeenLastCalledWith(CHARACTER_ID + 1);
  });

  it('survives closing the narrow sheet surface', async () => {
    const restore = stubViewport(NARROW_QUERY);
    try {
      loadCharacterRegionId.mockResolvedValue(THE_FORGE);
      const user = userEvent.setup();
      renderBoard();
      await openFilters(user);

      await pressMyRegion(user);
      await waitFor(() => expect(loadCharacterRegionId).toHaveBeenCalledTimes(1));
      await user.keyboard('{Escape}');

      await openFilters(user);
      expect(screen.getByRole('combobox', { name: 'From region' })).toHaveTextContent('The Forge');
    } finally {
      restore();
    }
  });
});

const AMARR_SYSTEM = 30002187;

function amarr(): CourierEndpoint {
  return {
    ...endpoint(DOMAIN, 'Amarr VIII'),
    systemName: 'Amarr',
    systemId: AMARR_SYSTEM,
    locationId: 60008494,
    security: 1,
  };
}

function laneRow(contractId: number, reward: number, volume: number): CourierRouteRow {
  return {
    contractId,
    regionId: THE_FORGE,
    originLocationId: 60003760,
    destinationLocationId: 60008494,
    reward,
    volume,
    dateExpired: Date.now() + 86_400_000,
    origin: endpoint(THE_FORGE, 'Jita IV - Moon 4'),
    destination: amarr(),
  };
}

const ORDINARY_LANE = Array.from({ length: 20 }, (_, index) =>
  laneRow(100 + index, 10_000_000 + index * 100_000, 10_000)
);
const BAIT = laneRow(999, 60_000_000, 500);
const RETURN_LANE: CourierRouteRow[] = [200, 201].map((contractId) => ({
  ...laneRow(contractId, 4_000_000, 10_000),
  origin: amarr(),
  destination: endpoint(THE_FORGE, 'Jita IV - Moon 4'),
}));
const LANE_ROWS = [...ORDINARY_LANE, BAIT, ...RETURN_LANE];

function knownJumps() {
  vi.mocked(localJumpCountsForRoutes).mockImplementation(async (routes) => ({
    kind: 'known',
    counts: routes.map(() => 9),
  }));
}

function renderLanes() {
  return render(
    <MemoryRouter>
      <CourierResults rows={LANE_ROWS} regionNames={REGION_NAMES} characterId={CHARACTER_ID} />
    </MemoryRouter>
  );
}

describe('CourierResults route cell', () => {
  it("prints each end's security right after its system name, not a space band", () => {
    render(
      <MemoryRouter>
        <CourierResults
          rows={[laneRow(1, 5_000_000, 1_000)]}
          regionNames={REGION_NAMES}
          characterId={CHARACTER_ID}
        />
      </MemoryRouter>
    );
    const route = within(screen.getAllByRole('row')[1]).getAllByRole('cell')[0];

    expect(route.textContent).toMatch(/Jita0\.9The Forge/);
    expect(route.textContent).toMatch(/Amarr1\.0Domain/);
    expect(route).not.toHaveTextContent('Highsec');
  });

  it('prints no security at all for an end nothing local places', () => {
    const unplaced: CourierRouteRow = {
      ...laneRow(1, 5_000_000, 1_000),
      destination: {
        ...amarr(),
        name: null,
        systemName: null,
        systemId: null,
        security: null,
        space: null,
        locationId: 1_039_000_000_001,
      },
    };
    render(
      <MemoryRouter>
        <CourierResults rows={[unplaced]} regionNames={REGION_NAMES} characterId={CHARACTER_ID} />
      </MemoryRouter>
    );
    const route = within(screen.getAllByRole('row')[1]).getAllByRole('cell')[0];

    expect(route.textContent).toMatch(/→ #1039000000001Domain$/);
    expect(route).not.toHaveTextContent('Unknown space');
  });
});

describe('CourierResults open detail', () => {
  it('follows its row when the structure it ends at is placed', async () => {
    const user = userEvent.setup();
    const structureEnd: CourierEndpoint = {
      ...amarr(),
      name: "Ainsan - Mav's Watering Hole",
      systemName: null,
      systemId: null,
      security: null,
      space: null,
      resolution: 'structure',
      hasStargates: null,
      locationId: 1_039_000_000_001,
    };
    const unplaced: CourierRouteRow = {
      ...laneRow(1, 5_000_000, 1_000),
      destination: structureEnd,
    };
    const board = (rows: readonly CourierRouteRow[]) => (
      <MemoryRouter>
        <CourierResults rows={rows} regionNames={REGION_NAMES} characterId={CHARACTER_ID} />
      </MemoryRouter>
    );
    const { rerender } = render(board([unplaced]));
    await user.click(within(screen.getAllByRole('row')[1]).getAllByRole('cell')[0]);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByRole('link', { name: 'Amarr' })).not.toBeInTheDocument();

    rerender(
      board([
        {
          ...unplaced,
          destination: {
            ...structureEnd,
            systemName: 'Amarr',
            systemId: AMARR_SYSTEM,
            security: 1,
          },
        },
      ])
    );

    expect(await within(dialog).findByRole('link', { name: 'Amarr' })).toBeInTheDocument();
  });
});

describe('CourierResults ISK/jump cell', () => {
  it('shows the going-rate multiple for an over-rate haul with a warning glyph, not a separate label', async () => {
    knownJumps();
    renderLanes();

    const baitRow = await waitFor(() => {
      const row = document.querySelector('tr[data-row-key="999"]');
      if (!row) throw new Error('expected the bait row');
      return row as HTMLElement;
    });
    const multiple = within(baitRow).getByText(/x going rate$/);
    expect(multiple.querySelector('svg')).not.toBeNull();
    expect(within(multiple).getByText('Over rate')).toHaveClass('sr-only');

    const ordinaryRow = document.querySelector('tr[data-row-key="100"]') as HTMLElement;
    const ordinary = within(ordinaryRow).getByText(/x going rate$/);
    expect(ordinary.querySelector('svg')).toBeNull();
    expect(within(ordinaryRow).queryByText('Over rate')).not.toBeInTheDocument();
  });

  it('keeps system names plain and makes the jump count the Route Safety link', async () => {
    knownJumps();
    renderLanes();

    const row = await waitFor(() => {
      const el = document.querySelector('tr[data-row-key="100"]');
      if (!el) throw new Error('expected row');
      return el as HTMLElement;
    });
    const links = await within(row).findAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAccessibleName('9 jumps — open route safety');
  });
});

describe('CourierResults on a phone', () => {
  let restore: () => void;
  beforeEach(() => {
    restore = stubViewport(PHONE_QUERY);
    knownJumps();
  });
  afterEach(() => restore());

  const laneToggle = () => screen.findByRole('button', { name: /^Jita.*→ Amarr/ });

  it('folds one lane behind a collapsed header naming its count and best ISK/jump', async () => {
    renderLanes();
    const toggle = await laneToggle();

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveTextContent('21 hauls · The Forge → Domain');
    await waitFor(() => expect(toggle).toHaveTextContent(/6\.7M \/J best/));
    expect(document.querySelector('tr[data-row-key="999"]')).toBeNull();
  });

  it("keeps a member's over-rate warning on the collapsed header", async () => {
    renderLanes();
    const toggle = await laneToggle();

    await waitFor(() => expect(within(toggle).getByText('Over rate')).toBeInTheDocument());
    expect(within(toggle).getByText('Over rate').className).toMatch(/warning/);
    const back = screen.getByRole('button', { name: /^Amarr.*→ Jita/ });
    expect(within(back).queryByText('Over rate')).not.toBeInTheDocument();
  });

  it('expands a lane on tap', async () => {
    const user = userEvent.setup();
    renderLanes();
    await user.click(await laneToggle());

    expect(await laneToggle()).toHaveAttribute('aria-expanded', 'true');
    expect(document.querySelector('tr[data-row-key="999"]')).toHaveClass('dt-group-member');
  });

  it('counts hauls and lanes over every row the filters kept', async () => {
    const many = Array.from({ length: 60 }, (_, index) =>
      laneRow(1_000 + index, 10_000_000, 10_000)
    );
    render(
      <MemoryRouter>
        <CourierResults
          rows={[...many, ...RETURN_LANE]}
          regionNames={REGION_NAMES}
          characterId={CHARACTER_ID}
        />
      </MemoryRouter>
    );

    expect(await screen.findByText('62 hauls · 2 lanes')).toBeInTheDocument();
  });

  it('groups over every row from the start, with no cap to lift', async () => {
    const many = Array.from({ length: 60 }, (_, index) =>
      laneRow(1_000 + index, 10_000_000, 10_000)
    );
    render(
      <MemoryRouter>
        <CourierResults
          rows={[...many, ...RETURN_LANE]}
          regionNames={REGION_NAMES}
          characterId={CHARACTER_ID}
        />
      </MemoryRouter>
    );

    expect(await laneToggle()).toHaveTextContent('60 hauls');
    expect(screen.getByRole('button', { name: /^Amarr.*→ Jita/ })).toHaveTextContent('2 hauls');
    expect(screen.queryByRole('button', { name: /^Show all/ })).not.toBeInTheDocument();
  });
});

describe('CourierResults remembered filter (issue #1719)', () => {
  it('restores a remembered filter value when the URL carries none', async () => {
    useCourierFilterPref.setState({
      value: { ...DEFAULT_COURIER_FILTER, maxCollateral: '50000000' },
      hydrated: true,
    });
    const user = userEvent.setup();
    renderBoard(CHARACTER_ID, ['/']);

    await openFilters(user);
    expect(screen.getByLabelText('Max collateral')).toHaveValue('50,000,000');
  });

  it("lets a shared link's URL param win over a remembered filter value", async () => {
    useCourierFilterPref.setState({
      value: { ...DEFAULT_COURIER_FILTER, maxCollateral: '50000000' },
      hydrated: true,
    });
    const user = userEvent.setup();
    renderBoard(CHARACTER_ID, ['/?courier.maxCollateral=1000']);

    await openFilters(user);
    expect(screen.getByLabelText('Max collateral')).toHaveValue('1,000');
  });

  it('remembers a filter change for the next visit', async () => {
    const user = userEvent.setup();
    renderBoard();

    await openFilters(user);
    await user.type(screen.getByLabelText('Max collateral'), '50000000');

    await waitFor(() =>
      expect(useCourierFilterPref.getState().value.maxCollateral).toBe('50000000')
    );
  });

  it('never remembers the free-text route search', async () => {
    const user = userEvent.setup();
    renderBoard();

    await user.type(screen.getByPlaceholderText('Search pickup or drop-off…'), 'jita');
    await openFilters(user);
    await user.type(screen.getByLabelText('Max collateral'), '1');

    expect(useCourierFilterPref.getState().value).not.toHaveProperty('routeQuery');
    expect(useCourierFilterPref.getState().value).not.toHaveProperty('pref');
  });
});

describe('CourierResults ISK filters', () => {
  it('accepts shorthand in Min reward', async () => {
    const user = userEvent.setup();
    renderBoard();
    await openFilters(user);
    const field = screen.getByRole('textbox', { name: 'Min reward' });
    await user.type(field, '1b');
    expect(field).toHaveValue('1b');
  });

  it('filters on the shorthand value, and plain digits still work', async () => {
    const user = userEvent.setup();
    renderBoard();
    await openFilters(user);
    const field = screen.getByRole('textbox', { name: 'Min reward' });
    await user.type(field, '10m');
    expect(screen.queryAllByText(/Jita/)).toHaveLength(0);
    await user.clear(field);
    await user.type(field, '5000000');
    expect(field).toHaveValue('5,000,000');
    expect(screen.getAllByText(/Jita/).length).toBeGreaterThan(0);
  });

  it('shows no hint for an empty or unparseable field', async () => {
    const user = userEvent.setup();
    renderBoard();
    await openFilters(user);
    await user.type(screen.getByRole('textbox', { name: 'Max collateral' }), '1x');
    expect(screen.queryByText(/^= .* ISK$/)).not.toBeInTheDocument();
  });
});
