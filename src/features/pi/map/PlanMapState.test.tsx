import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import '@/i18n';
import { buildPlanAdvice, hubBooks, type PlanAdvice } from '@/features/pi/planAdviceModel';
import { planPicks } from '@/features/pi/planPicks';
import { usePlanPreference } from '@/features/pi/planTicksPref';
import { adviceInput, pi } from '@/features/pi/map/mapFixtures.testutil';
import { DOCK_MIN_PANEL_WIDTH } from '@/features/pi/map/mapModel';
import { PlanMap } from '@/features/pi/map/PlanMap';
import { DEFAULT_PI_SETTINGS, usePiSettings } from '@/features/pi/piSettings';
import { WHAT_IF_PLANET_ID } from '@/features/pi/biggerChainsModel';
import type { WhatIfChainsState } from '@/features/pi/useBiggerChains';
import {
  advice,
  adviceNone,
  graphName,
  installPlanMapHarness,
  maybeProduct,
  planet,
  product,
  props,
  renderMap,
  reportWidth,
  stubPhone,
  withWhatIf,
} from '@/test/planMap';

// What-if Bigger chains: the solver is `useWhatIfChains`'s own test; here only what the Map draws.
let mockWhatIf: WhatIfChainsState = { byType: new Map(), pending: false };
const whatIfAskedFor = vi.fn();
vi.mock('@/features/pi/useBiggerChains', () => ({
  NO_WHAT_IF_CHAINS: { byType: new Map(), pending: false },
  useWhatIfChains: (_advice: unknown, _pi: unknown, wanted: readonly string[]) => {
    whatIfAskedFor([...wanted]);
    return mockWhatIf;
  },
}));

// The finder reads the SDE and the stargate graph; its own behaviour is not under test here.
vi.mock('@/features/pi/map/PlanetFinder', () => ({
  PlanetFinder: ({ types }: { types: readonly string[] }) => (
    <div data-testid="finder">finder for {types.join(',')}</div>
  ),
}));

installPlanMapHarness();

describe('PlanMap: starting state follows the data until the pilot acts', () => {
  const firstPickName = (a: PlanAdvice) => graphName(planPicks(a).picks[0].typeId);

  it('re-derives the starting trace and ticks when the picks and colonies change', () => {
    const view = renderMap();
    expect(product(firstPickName(advice))).toHaveAttribute('aria-current', 'true');
    view.rerender(
      <MemoryRouter>
        <PlanMap
          {...props({ advice: adviceNone, colonies: [], adviceWithWhatIf: withWhatIf('none') })}
        />
      </MemoryRouter>
    );
    expect(planet('Lava')).toHaveAttribute('aria-pressed', 'true');
    expect(product(firstPickName(adviceNone))).toHaveAttribute('aria-current', 'true');
  });

  it('never overrides what the pilot chose', async () => {
    const user = userEvent.setup({ delay: null });
    const view = renderMap();
    await user.click(planet('Temperate'));
    await user.click(planet('Temperate'));
    await user.click(product('Proteins'));
    await user.keyboard('{Escape}');
    view.rerender(
      <MemoryRouter>
        <PlanMap
          {...props({ advice: adviceNone, colonies: [], adviceWithWhatIf: withWhatIf('none') })}
        />
      </MemoryRouter>
    );
    expect(planet('Lava')).toHaveAttribute('aria-pressed', 'false');
    expect(product('Proteins')).toHaveAttribute('aria-current', 'true');
  });
});

describe('PlanMap: what-if row', () => {
  it('draws no what-if row or hint button until a planet type is hovered or ticked', () => {
    renderMap();
    expect(screen.getByTestId('map-whatif')).toBeEmptyDOMElement();
    expect(screen.queryByRole('button', { name: 'About planet types you do not have' })).toBeNull();
    expect(screen.queryByText(/to filter, or a product to trace it/)).toBeNull();
  });

  it('explains the tile marks in a legend beside the title, only the marks the board draws', () => {
    renderMap();
    const legend = screen.getByLabelText('Map legend');
    expect(legend).toHaveTextContent('ISK a day from one planet');
    expect(legend).toHaveTextContent("worse than that planet's simplest product");
    // No multi-planet chain on this board, so no Est. entry.
    expect(legend).not.toHaveTextContent('Est.');
  });
});

describe('PlanMap: phone', () => {
  it('shows a tier switcher and list, opens a bottom sheet, and keeps the full map behind a button', async () => {
    stubPhone(true);
    const user = userEvent.setup({ delay: null });
    renderMap();
    expect(screen.queryByRole('group', { name: /^Planet map/ })).toBeNull();
    const switcher = screen.getByRole('group', { name: 'Product tier' });
    await user.click(within(switcher).getByRole('button', { name: 'P1' }));
    // The row's title carries the accent cue at rest, before any tap (DESIGN.md §6c "Phone cards").
    expect(
      within(screen.getByRole('link', { name: /^Biofuels/ })).getByText('Biofuels')
    ).toHaveClass('text-accent');
    await user.click(screen.getByRole('link', { name: /^Biofuels/ }));
    const sheet = screen.getByRole('dialog', { name: /^(How to make|Where to get) / });
    expect(within(sheet).getByRole('link', { name: 'View in Market' })).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: 'Close' }));
    await user.click(screen.getByRole('button', { name: 'Show full map' }));
    expect(screen.getByRole('group', { name: /^Planet map/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide full map' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
  });
});

describe('PlanMap: the picks note says what is shared with Plan', () => {
  afterEach(async () => {
    await usePlanPreference.getState().setValue('isk');
  });

  it.each([
    ['isk', 'ranked by most ISK'],
    ['haul', 'ranked by least hauling'],
  ] as const)('names the %s preference', async (preference, text) => {
    const user = userEvent.setup({ delay: null });
    await usePlanPreference.getState().setValue(preference);
    renderMap();
    await user.hover(await screen.findByRole('button', { name: 'About these picks' }));
    expect((await screen.findAllByText(new RegExp(text))).length).toBeGreaterThan(0);
  });

  it('says the recipe list is shown before the Plan tab filters', async () => {
    const user = userEvent.setup({ delay: null });
    renderMap({ advice: adviceNone, colonies: [], adviceWithWhatIf: withWhatIf('none') });
    await user.hover(screen.getByRole('button', { name: 'About these picks' }));
    expect((await screen.findAllByText(/before the Plan tab's filters/)).length).toBeGreaterThan(0);
  });
});

// A colony's richness override is the URL's `?planet=`, in the same drawer as a product.
describe('PlanMap richness drawer', () => {
  it("opens a colony's richness chips from ?planet= on a phone", async () => {
    stubPhone(true);
    renderMap({}, '/planetary-industry/map?planet=40000001');
    expect(
      await screen.findByRole('group', { name: 'Resources you would pull here' })
    ).toBeVisible();
    expect(screen.getByText('Optional')).toBeVisible();
  });

  it('shows it in the docked panel too, with a way back', async () => {
    renderMap({}, '/planetary-industry/map?planet=40000001');
    reportWidth(DOCK_MIN_PANEL_WIDTH);
    const aside = await screen.findByRole('complementary', { name: 'Resources on Hek VIII' });
    expect(
      within(aside).getByRole('group', { name: 'Resources you would pull here' })
    ).toBeVisible();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(within(aside).getByRole('button', { name: 'Back to the map' })).toBeVisible();
  });

  it('keeps only the drawer it shows when the URL names a planet and a product', async () => {
    stubPhone(true);
    function Search() {
      return <output data-testid="search">{useLocation().search}</output>;
    }
    render(
      <MemoryRouter initialEntries={['/planetary-industry/map?planet=40000001&product=9832']}>
        <PlanMap {...props()} />
        <Search />
      </MemoryRouter>
    );
    expect(
      await screen.findByRole('group', { name: 'Resources you would pull here' })
    ).toBeVisible();
    await waitFor(() =>
      expect(screen.getByTestId('search')).toHaveTextContent(/^\?planet=40000001$/)
    );
  });

  it('ignores a planet the pilot has no colony on', async () => {
    stubPhone(true);
    renderMap({}, '/planetary-industry/map?planet=123');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole('group', { name: 'Resources you would pull here' })).toBeNull();
  });
});

describe('PlanMap with hub prices unreadable', () => {
  it('does not claim the planets already make their best product', () => {
    const unpriced = buildPlanAdvice(
      adviceInput('lean', { books: hubBooks({ prices: {}, buyPrices: {} }, 5) })
    );
    renderMap({ advice: unpriced, pricesFailed: true });
    expect(screen.queryByText(/already make their best product/)).not.toBeInTheDocument();
    expect(screen.getByText(/Picks need hub prices/)).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /^Planet map|^Planets$/ })).toBeInTheDocument();
  });

  it('drops the figure legend: no tile has a figure or a mark to explain', () => {
    const unpriced = buildPlanAdvice(
      adviceInput('lean', { books: hubBooks({ prices: {}, buyPrices: {} }, 5) })
    );
    renderMap({ advice: unpriced, pricesFailed: true });
    expect(screen.queryByLabelText('Map legend')).not.toBeInTheDocument();
  });
});

describe('PlanMap: what-if Bigger chains, when the pilot hauls between planets', () => {
  const CAMERA_DRONES = 2345;
  beforeEach(() => {
    whatIfAskedFor.mockClear();
    mockWhatIf = {
      byType: new Map([
        [
          'lava',
          new Map([
            [
              CAMERA_DRONES,
              {
                colonies: {
                  typeId: CAMERA_DRONES,
                  iskPerDay: 50_000,
                  unitsPerDay: 10,
                  planetIds: [WHAT_IF_PLANET_ID, 40000001],
                  hostId: 40000001,
                  m3PerWeek: 900,
                  legs: [{ from: WHAT_IF_PLANET_ID, to: 40000001, jumps: null }],
                },
                newPlanets: null,
              },
            ],
          ]),
        ],
      ]),
      pending: false,
    };
  });
  afterEach(() => usePiSettings.setState({ value: DEFAULT_PI_SETTINGS, hydrated: true }));

  const haulBetween = (on: boolean) =>
    usePiSettings.setState({
      value: { ...DEFAULT_PI_SETTINGS, ...(on ? { haulBetweenPlanets: true as const } : {}) },
      hydrated: true,
    });

  it('lights the P3/P4 a ticked what-if planet makes possible with its multi-planet estimate, never a pick', async () => {
    const user = userEvent.setup({ delay: null });
    haulBetween(true);
    renderMap({ pi });
    const picksBefore = screen.getByRole('group', { name: /picks/i }).textContent;
    await user.click(planet('Lava'));
    expect(whatIfAskedFor).toHaveBeenLastCalledWith([['lava']]);
    expect(product('Camera Drones')).toHaveAccessibleName(
      /With a Lava planet added, a Bigger chain on your planets \(multi-planet estimate, needs hauling\): about 50,000 ISK a day across 2 planets/
    );
    expect(screen.getByLabelText('Map legend')).toHaveTextContent('Est.');
    const dialog = screen.getByRole('dialog', { name: 'Where to put a new Lava colony' });
    expect(within(dialog).getByText('Bigger chains with it')).toBeInTheDocument();
    const card = within(dialog).getByRole('link', { name: 'Camera Drones' }).closest('li')!;
    expect(card).toHaveTextContent(/a new Lava planet/);
    expect(card).toHaveTextContent(/→ .*: not known yet/);
    expect(screen.getByRole('group', { name: /picks/i }).textContent).toBe(picksBefore);
  });

  it('keeps the what-if tick, and its chains, when a product is traced', async () => {
    const user = userEvent.setup({ delay: null });
    haulBetween(true);
    renderMap({ pi });
    await user.click(planet('Lava'));
    await user.keyboard('{Escape}');
    await user.click(product('Camera Drones'));
    expect(planet('Lava')).toHaveAttribute('aria-pressed', 'true');
    expect(product('Camera Drones')).toHaveAccessibleName(/With a Lava planet added/);
  });

  it('adds each clicked planet type to the what-if, priced as one set', async () => {
    const user = userEvent.setup({ delay: null });
    haulBetween(true);
    renderMap({ pi, advice: { ...advice, slots: { ...advice.slots, free: 2 } } });
    await user.click(planet('Lava'));
    await user.click(planet('Plasma'));
    expect(planet('Lava')).toHaveAttribute('aria-pressed', 'true');
    expect(planet('Plasma')).toHaveAttribute('aria-pressed', 'true');
    expect(whatIfAskedFor).toHaveBeenLastCalledWith([['lava', 'plasma']]);
    const dialog = screen.getByRole('dialog', {
      name: 'Where to put new Lava and Plasma colonies',
    });
    expect(within(dialog).getByText('Add Lava and Plasma planets')).toBeInTheDocument();
    expect(screen.getByTestId('finder')).toHaveTextContent('finder for lava,plasma');
    // Unticking one leaves the other, and the panel open.
    await user.click(planet('Lava'));
    expect(planet('Lava')).toHaveAttribute('aria-pressed', 'false');
    expect(planet('Plasma')).toHaveAttribute('aria-pressed', 'true');
    expect(whatIfAskedFor).toHaveBeenLastCalledWith([['plasma']]);
    expect(screen.getByRole('dialog', { name: 'Where to put a new Plasma colony' })).toBeVisible();
    // The last one off closes it.
    await user.click(planet('Plasma'));
    expect(screen.queryByRole('dialog', { name: /Where to put/ })).toBeNull();
  });

  it('says so, and prices nothing, when the ticked planets need more free slots than there are', async () => {
    const user = userEvent.setup({ delay: null });
    haulBetween(true);
    renderMap({ pi, advice: { ...advice, slots: { ...advice.slots, free: 1 } } });
    await user.click(planet('Lava'));
    await user.click(planet('Plasma'));
    const dialog = screen.getByRole('dialog', {
      name: 'Where to put new Lava and Plasma colonies',
    });
    expect(
      within(dialog).getByText(/These planets need 2 free planet slots and you have 1/)
    ).toBeInTheDocument();
    expect(whatIfAskedFor).toHaveBeenLastCalledWith([['lava']]);
  });

  it('prices nothing and shows no chains with the setting off', async () => {
    const user = userEvent.setup({ delay: null });
    haulBetween(false);
    renderMap({ pi });
    await user.click(planet('Lava'));
    expect(whatIfAskedFor).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog', { name: 'Where to put a new Lava colony' });
    expect(within(dialog).queryByText('Bigger chains with it')).toBeNull();
    // Gas and Lava raws: not lit by a Lava planet alone, and no what-if figure anywhere.
    expect(maybeProduct('Camera Drones')).toBeNull();
    expect(screen.queryAllByRole('link', { name: /With a Lava planet added/ })).toEqual([]);
  });
});
