import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import '@/i18n';
import { CourierResults } from '@/features/contractSearch/CourierResults';
import type { CourierEndpoint, CourierRouteRow } from '@/engine/contracts/courierSearch';
import { NARROW_QUERY } from '@/lib/useIsNarrow';
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

// The jump graph is a route concern with its own tests; here it would only
// add an async settle to every case.
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
    // A plain named NPC station with gates: nothing here is about the scam
    // markers (#944), so both ends stay unremarkable.
    resolution: 'station',
    hasStargates: true,
  };
}

/** One haul out of The Forge — so The Forge is the only origin region on offer. */
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

/**
 * Phone width, where `FilterBar` swaps the inline row for a sheet whose edits
 * are a draft committed with Apply — a different commit path for `onPick` than
 * the pointer-width row, which writes straight through.
 */
function stubNarrowViewport() {
  const real = window.matchMedia;
  window.matchMedia = ((media: string) =>
    ({
      media,
      matches: media === NARROW_QUERY,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList) as typeof window.matchMedia;
  return () => {
    window.matchMedia = real;
  };
}

/** Every `FilterBar` keeps its controls behind the funnel, so open it first. */
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

/** Reads the URL `MemoryRouter` produced; unlike a real router it never touches `window.location`. */
function LocationProbe() {
  const { search } = useLocation();
  return <span data-testid="location-search">{search}</span>;
}

function renderBoardWithProbe(initialEntries: string[] = ['/']) {
  render(
    <MemoryRouter initialEntries={initialEntries}>
      <CourierResults rows={ROWS} regionNames={REGION_NAMES} characterId={CHARACTER_ID} />
      <LocationProbe />
    </MemoryRouter>
  );
  return () => screen.getByTestId('location-search').textContent ?? '';
}

const myRegionButton = () => screen.getByRole('button', { name: 'From my region' });

beforeEach(() => {
  loadCharacterRegionId.mockReset();
  vi.mocked(localJumpCountsForRoutes).mockResolvedValue({ kind: 'unknown' });
  // Pre-hydrated to no restriction: a change one case makes (e.g. the region
  // shortcut) must never leak into the next as a remembered default (issue #1719).
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

describe('CourierResults "From my region" shortcut', () => {
  it('costs nothing until it is pressed', async () => {
    loadCharacterRegionId.mockResolvedValue(THE_FORGE);
    const user = userEvent.setup();
    renderBoard();

    await openFilters(user);

    expect(myRegionButton()).toBeInTheDocument();
    expect(loadCharacterRegionId).not.toHaveBeenCalled();
  });

  it('asks once however fast it is pressed twice', async () => {
    // Deferred on purpose: an implementation with no in-flight guard passes a
    // test whose mock has already settled by the second click.
    let release: (regionId: number) => void = () => {};
    loadCharacterRegionId.mockReturnValue(
      new Promise<number | null>((resolve) => {
        release = resolve;
      })
    );
    const user = userEvent.setup();
    renderBoard();
    await openFilters(user);

    await user.click(myRegionButton());
    await waitFor(() => expect(myRegionButton()).toBeDisabled());
    await user.click(myRegionButton());
    release(THE_FORGE);

    await waitFor(() => expect(myRegionButton()).toBeEnabled());
    expect(loadCharacterRegionId).toHaveBeenCalledTimes(1);
  });

  it('sets the origin region filter from the character location', async () => {
    loadCharacterRegionId.mockResolvedValue(THE_FORGE);
    const user = userEvent.setup();
    renderBoard();
    await openFilters(user);

    await user.click(screen.getByRole('button', { name: 'From my region' }));

    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'From region' })).toHaveTextContent('The Forge')
    );
  });

  it('never sets a region the dropdown has no option for, and says why', async () => {
    // The character is in Domain; no haul in the snapshot starts there.
    loadCharacterRegionId.mockResolvedValue(DOMAIN);
    const user = userEvent.setup();
    renderBoard();
    await openFilters(user);

    await user.click(screen.getByRole('button', { name: 'From my region' }));

    await waitFor(() =>
      expect(screen.getByText('No hauls start in your region')).toBeInTheDocument()
    );
    expect(screen.getByRole('button', { name: 'From my region' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'From region' })).toHaveTextContent('All regions');
  });

  it('goes quietly unavailable when the location cannot be resolved', async () => {
    // What a character whose grant predates the location scope gets: a 403 the
    // loader reports as `null`, never a re-auth banner.
    loadCharacterRegionId.mockResolvedValue(null);
    const user = userEvent.setup();
    renderBoard();
    await openFilters(user);

    await user.click(screen.getByRole('button', { name: 'From my region' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'From my region' })).toBeDisabled()
    );
    // A reason, not a banner: a dead control with no explanation reads as broken.
    expect(screen.getByText('Your current location is unavailable')).toBeInTheDocument();
    expect(screen.queryByText('No hauls start in your region')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'From region' })).toHaveTextContent('All regions');
  });

  it('keeps the answer when the filter bar is collapsed and reopened', async () => {
    // `FilterBar` unmounts its controls on collapse, so an answer held inside
    // the control itself would be re-asked — and re-charged — on every reopen.
    loadCharacterRegionId.mockResolvedValue(THE_FORGE);
    const user = userEvent.setup();
    renderBoard();
    await openFilters(user);
    await user.click(myRegionButton());
    await waitFor(() => expect(loadCharacterRegionId).toHaveBeenCalledTimes(1));

    await openFilters(user); // collapse
    await openFilters(user); // reopen
    await user.click(myRegionButton());

    expect(loadCharacterRegionId).toHaveBeenCalledTimes(1);
  });

  it('re-resolves when the active character changes', async () => {
    loadCharacterRegionId.mockResolvedValue(DOMAIN);
    const user = userEvent.setup();
    const { rerender } = renderBoard();
    await openFilters(user);
    await user.click(myRegionButton());
    await waitFor(() => expect(myRegionButton()).toBeDisabled());

    loadCharacterRegionId.mockResolvedValue(THE_FORGE);
    rerender(
      <MemoryRouter>
        <CourierResults rows={ROWS} regionNames={REGION_NAMES} characterId={CHARACTER_ID + 1} />
      </MemoryRouter>
    );

    // The previous character's "no hauls start there" must not survive them.
    await waitFor(() => expect(myRegionButton()).toBeEnabled());
    await user.click(myRegionButton());
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'From region' })).toHaveTextContent('The Forge')
    );
    expect(loadCharacterRegionId).toHaveBeenLastCalledWith(CHARACTER_ID + 1);
  });

  it('survives Apply on the narrow sheet surface', async () => {
    const restore = stubNarrowViewport();
    try {
      loadCharacterRegionId.mockResolvedValue(THE_FORGE);
      const user = userEvent.setup();
      renderBoard();
      await openFilters(user);

      await user.click(myRegionButton());
      await waitFor(() => expect(loadCharacterRegionId).toHaveBeenCalledTimes(1));
      await user.click(screen.getByRole('button', { name: 'Apply' }));

      await openFilters(user);
      expect(screen.getByRole('combobox', { name: 'From region' })).toHaveTextContent('The Forge');
    } finally {
      restore();
    }
  });
});

const AMARR_SYSTEM = 30002187;

/** Amarr, as its own system: `endpoint()` above puts Jita at both ends. */
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

/**
 * A lane with a going rate: `corpusGoingRate` refuses a median under twenty
 * rates, so twenty ordinary hauls set it and one small parcel pays far above
 * it — the bait shape the over-rate marker exists for. Two more hauls on a
 * second lane (Amarr → Jita), so a board has more than one lane to count.
 */
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

/** Every haul 9 jumps, so the board has distances and the corpus a median. */
function knownJumps() {
  vi.mocked(localJumpCountsForRoutes).mockImplementation(async (routes) => ({
    kind: 'known',
    counts: routes.map(() => 9),
  }));
}

function stubPhoneViewport() {
  const real = window.matchMedia;
  window.matchMedia = ((media: string) =>
    ({
      media,
      matches: media === PHONE_QUERY,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList) as typeof window.matchMedia;
  return () => {
    window.matchMedia = real;
  };
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

    // Rounded the way the game shows it (0.9459 → 0.9), then the region.
    // jsdom's `textContent` has no layout spacing, so adjacency is the order.
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

describe('CourierResults ISK/jump cell', () => {
  it('names an over-rate haul in text on the desktop table too, not only by border colour', async () => {
    knownJumps();
    renderLanes();

    const baitRow = await waitFor(() => {
      const row = document.querySelector('tr[data-row-key="999"]');
      if (!row) throw new Error('expected the bait row');
      return row as HTMLElement;
    });
    expect(within(baitRow).getByText('Over rate')).toBeInTheDocument();

    // An ordinary haul on the same lane carries the multiple with no marker.
    const ordinaryRow = document.querySelector('tr[data-row-key="100"]') as HTMLElement;
    expect(within(ordinaryRow).queryByText('Over rate')).not.toBeInTheDocument();
  });
});

describe('CourierResults on a phone', () => {
  let restore: () => void;
  beforeEach(() => {
    restore = stubPhoneViewport();
    knownJumps();
  });
  afterEach(() => restore());

  const laneToggle = () => screen.findByRole('button', { name: /^Jita.*→ Amarr/ });

  it('folds one lane behind a collapsed header naming its count and best ISK/jump', async () => {
    renderLanes();
    const toggle = await laneToggle();

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveTextContent('21 hauls · The Forge → Domain');
    // 60M over 9 jumps — the group's maximum, whatever the members sort by.
    await waitFor(() => expect(toggle).toHaveTextContent(/6\.7M \/J best/));
    // Collapsed means not rendered: none of the lane's hauls is a row yet.
    expect(document.querySelector('tr[data-row-key="999"]')).toBeNull();
  });

  it("keeps a member's over-rate warning on the collapsed header", async () => {
    renderLanes();
    const toggle = await laneToggle();

    // A folded lane must never hide the scam signal inside it.
    await waitFor(() => expect(within(toggle).getByText('Over rate')).toBeInTheDocument());
    expect(within(toggle).getByText('Over rate').className).toMatch(/warning/);
    // The return lane pays the going rate, so its header carries no marker.
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
    // 60 hauls on one lane plus the two-haul return lane.
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

    // No pre-grouping cap on phone: the lane's true count shows immediately.
    expect(await laneToggle()).toHaveTextContent('60 hauls');
    expect(screen.getByRole('button', { name: /^Amarr.*→ Jita/ })).toHaveTextContent('2 hauls');
    // Nothing left to reveal, so the cap-lifting control has no reason to show.
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
    expect(screen.getByLabelText('Max collateral')).toHaveValue('50000000');
  });

  it("lets a shared link's URL param win over a remembered filter value", async () => {
    useCourierFilterPref.setState({
      value: { ...DEFAULT_COURIER_FILTER, maxCollateral: '50000000' },
      hydrated: true,
    });
    const user = userEvent.setup();
    renderBoard(CHARACTER_ID, ['/?courier.maxCollateral=1000']);

    await openFilters(user);
    expect(screen.getByLabelText('Max collateral')).toHaveValue('1000');
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

    // `routeQuery` has no field on the stored shape at all — see `courierFilterPref.ts`.
    expect(useCourierFilterPref.getState().value).not.toHaveProperty('routeQuery');
    expect(useCourierFilterPref.getState().value).not.toHaveProperty('pref');
  });

  /** Guards `changedFields` — see its comment in CourierResults.tsx. */
  it('never writes a remembered value into the URL when an unrelated field changes', async () => {
    useCourierFilterPref.setState({
      value: { ...DEFAULT_COURIER_FILTER, maxCollateral: '50000000' },
      hydrated: true,
    });
    const user = userEvent.setup();
    const currentSearch = renderBoardWithProbe(['/']);

    await openFilters(user);
    await user.type(screen.getByLabelText('Min reward'), '1');

    await waitFor(() => expect(currentSearch()).toContain('courier.minReward'));
    expect(currentSearch()).not.toContain('maxCollateral');
  });

  /**
   * Symmetric case: a shared link's `originRegionId` must stay scoped to the
   * URL and never leak into the remembered default just because the hauler
   * happened to edit some other field while that link was open.
   */
  it('never overwrites the remembered default with a URL-only value when an unrelated field changes', async () => {
    useCourierFilterPref.setState({ value: DEFAULT_COURIER_FILTER, hydrated: true });
    const user = userEvent.setup();
    renderBoard(CHARACTER_ID, ['/?courier.origin=10000002']);

    await openFilters(user);
    await user.type(screen.getByLabelText('Max collateral'), '1');

    await waitFor(() => expect(useCourierFilterPref.getState().value.maxCollateral).toBe('1'));
    expect(useCourierFilterPref.getState().value.originRegionId).toBeNull();
  });
});

describe('CourierResults ISK filters', () => {
  it('accepts shorthand in Min reward and echoes the parsed figure', async () => {
    const user = userEvent.setup();
    renderBoard();
    await openFilters(user);
    const field = screen.getByRole('textbox', { name: 'Min reward' });
    await user.type(field, '1b');
    expect(field).toHaveValue('1b');
    expect(screen.getByText('= 1,000,000,000 ISK')).toBeInTheDocument();
  });

  it('filters on the shorthand value, and plain digits still work', async () => {
    const user = userEvent.setup();
    renderBoard();
    await openFilters(user);
    const field = screen.getByRole('textbox', { name: 'Min reward' });
    // The one haul pays 5,000,000: 10m excludes it, 5m keeps it.
    await user.type(field, '10m');
    expect(screen.queryAllByText(/Jita/)).toHaveLength(0);
    await user.clear(field);
    await user.type(field, '5000000');
    expect(screen.getByText('= 5,000,000 ISK')).toBeInTheDocument();
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
