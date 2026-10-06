import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { RecipeRow } from '@/engine/pi/planRecipes';
import type { PlanAdviceState } from './usePlanAdvice';
import type { GoalPlannerSnapshot } from './goalPlannerSnapshot';
import type { PlanAdvice } from './planAdviceModel';
import { FindBestPlan } from './FindBestPlan';
import { fixturePi } from './planViewFixture';
import { DEFAULT_PI_SETTINGS, usePiSettings } from './piSettings';
import type { FinderOrigin, FinderState } from './usePlanetFinder';

let mockState: PlanAdviceState = { status: 'loading' };
let mockOrigin: FinderOrigin = {
  status: 'known',
  systemId: 30000142,
  name: 'Hek',
  security: 0.9,
  source: 'colonies',
};
let mockFinder: FinderState = { status: 'loading' };
let finderArgs: { highsecOnly: boolean } | null = null;
vi.mock('./usePlanAdvice', () => ({ usePlanAdvice: () => mockState }));
vi.mock('./usePlanetFinder', () => ({
  useFinderOrigin: () => mockOrigin,
  usePlanetFinder: (args: { highsecOnly: boolean }) => {
    finderArgs = args;
    return mockFinder;
  },
}));

const idOf = (name: string) =>
  Number(Object.entries(fixturePi.schematics).find(([, s]) => s.name === name)?.[0]);
const rawId = (name: string) => fixturePi.raw.find((r) => r.name === name)!.typeID;
const SILICON = idOf('Silicon');
const COOLANT = idOf('Coolant');
const PROTEINS = idOf('Proteins');

const row = (
  typeId: number,
  name: string,
  tier: 1 | 2,
  planetType: RecipeRow['planetType'],
  iskPerDay: number
): RecipeRow => ({
  typeId,
  name,
  tier,
  planetType,
  iskPerDay,
  m3PerDay: 10,
  layout: {
    unitsPerDay: 240,
    pins: { extractorControlUnit: 1, basic: 2, launchpad: 1 },
    extracts: [rawId('Felsic Magma')],
    makes: [{ typeId, facility: tier === 1 ? 'basic' : 'advanced' }],
  },
});

const ROWS = [
  row(SILICON, 'Silicon', 1, 'lava', 100_000),
  row(COOLANT, 'Coolant', 2, 'lava', 150_000),
  row(PROTEINS, 'Proteins', 1, 'oceanic', 200_000),
];

function advice(over: Partial<PlanAdvice> = {}): PlanAdvice {
  return {
    colonies: [],
    recipeRows: ROWS,
    rankingBasis: { rateSource: 'assumed', ccLevel: 4, ccAssumed: false, linkCost: 'assumed' },
    recipes: { recipes: [], bestAnywherePerDay: null, unpriced: [] },
    slots: { used: 0, allowed: 1, free: 0, maxSlots: 6, assumed: false },
    ...over,
  } as unknown as PlanAdvice;
}

function snapshot(types: string[] = []): GoalPlannerSnapshot {
  return {
    pi: fixturePi,
    colonies: types.map((planet_type, i) => ({
      planet_id: i + 1,
      planet_type,
      solar_system_id: 30000142,
    })),
    planetNames: new Map(types.map((_, i) => [i + 1, `Hek ${i + 1}`])),
  } as unknown as GoalPlannerSnapshot;
}

function renderPlan(snap = snapshot()) {
  return render(
    <MemoryRouter>
      <FindBestPlan snapshot={snap} characterId={1} />
    </MemoryRouter>
  );
}

const cardItems = () => Array.from(document.querySelectorAll('ol > li'));

beforeEach(() => {
  usePiSettings.setState({ value: DEFAULT_PI_SETTINGS, hydrated: true });
  mockState = { status: 'ready', advice: advice(), pricesFetchedAt: new Date(), hubName: 'Jita' };
  mockFinder = { status: 'loading' };
  finderArgs = null;
  Element.prototype.scrollIntoView = vi.fn();
});

describe('FindBestPlan', () => {
  it('ranks recipes best first, with every planet type available when there are no colonies', () => {
    renderPlan();
    const types = screen.getByRole('group', { name: 'Planet types' });
    expect(within(types).getAllByRole('button', { pressed: true })).toHaveLength(8);
    const cards = cardItems();
    expect(cards[0]).toHaveTextContent('Proteins');
    expect(cards[0]).toHaveTextContent('Find one');
    expect(cards[1]).toHaveTextContent('Coolant');
  });

  it('filters to factory goods (P2)', async () => {
    const user = userEvent.setup();
    renderPlan();
    await user.click(screen.getByRole('button', { name: 'Factory goods (P2)' }));
    const cards = cardItems();
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveTextContent('Coolant');
  });

  it('explains a tier filter that ranks nothing', async () => {
    mockState = {
      status: 'ready',
      advice: advice({ recipeRows: [ROWS[0], ROWS[2]] }),
      pricesFetchedAt: new Date(),
      hubName: 'Jita',
    };
    const user = userEvent.setup();
    renderPlan();
    await user.click(screen.getByRole('button', { name: 'Factory goods (P2)' }));
    expect(screen.getByText(/No Factory goods \(P2\) setup fits one planet/)).toBeInTheDocument();
  });

  it('lists a setup that needs a higher Command Center below the ones that fit, tagged with a skill link', () => {
    mockState = {
      status: 'ready',
      advice: advice({
        recipeRows: [{ ...ROWS[2], needsCcLevel: 3 }, ROWS[0]],
      }),
      pricesFetchedAt: new Date(),
      hubName: 'Jita',
    };
    renderPlan();
    const cards = cardItems();
    expect(cards[0]).toHaveTextContent('Silicon');
    expect(cards[0]).not.toHaveTextContent('needs CC level');
    expect(cards[1]).toHaveTextContent('Proteins');
    expect(cards[1]).toHaveTextContent('needs CC level 3');
    expect(within(cards[1] as HTMLElement).getByText('CC level 3')).toBeInTheDocument();
  });

  it('shows the tagged setups, not an empty state, when none fit', () => {
    mockState = {
      status: 'ready',
      advice: advice({ recipeRows: ROWS.map((r) => ({ ...r, needsCcLevel: 2 })) }),
      pricesFetchedAt: new Date(),
      hubName: 'Jita',
    };
    renderPlan();
    expect(cardItems()).toHaveLength(3);
    expect(screen.queryByText(/No one-planet setup fits/)).not.toBeInTheDocument();
  });

  it('does not blame the Command Center when prices are missing', () => {
    mockState = {
      status: 'ready',
      advice: advice({
        recipeRows: [],
        recipes: { recipes: [], bestAnywherePerDay: null, unpriced: [SILICON] },
      }),
      pricesFetchedAt: new Date(),
      hubName: 'Jita',
    };
    renderPlan();
    expect(screen.getByText(/Nothing could be priced at Jita/)).toBeInTheDocument();
    expect(screen.queryByText(/Command Center/)).not.toBeInTheDocument();
  });

  it('hides recipes only a switched-off planet type could host', async () => {
    const user = userEvent.setup();
    renderPlan();
    await user.click(screen.getByRole('button', { name: 'Oceanic' }));
    expect(screen.queryByText('Proteins')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Oceanic' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('opens Show me how under the tapped card and moves focus to it', async () => {
    const user = userEvent.setup();
    mockFinder = {
      status: 'ready',
      systems: [
        {
          systemId: 30000144,
          name: 'Perimeter',
          jumps: 1,
          security: 0.95,
          planetCounts: { oceanic: 2 },
        },
      ],
    };
    renderPlan();
    const button = screen.getAllByRole('button', { name: /Show me how/ })[0];
    expect(button).toHaveAttribute('aria-expanded', 'false');
    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    const panel = document.getElementById(button.getAttribute('aria-controls')!)!;
    expect(panel).toHaveFocus();
    expect(panel.closest('li')).toBe(button.closest('li'));
    expect(within(panel).getByRole('link', { name: 'Perimeter' })).toBeInTheDocument();
    expect(panel).toHaveTextContent('Command Center');
    expect(panel).toHaveTextContent('Reset the extractors every');
    await user.click(within(panel).getByRole('button', { name: 'Close' }));
    expect(document.getElementById(panel.id)).toBeNull();
  });

  it('opens Show me how at step 1 from the Find one control, and keeps it open on a second press', async () => {
    const user = userEvent.setup();
    renderPlan();
    const card = cardItems()[0];
    const findOne = within(card as HTMLElement).getAllByRole('button', { name: /^Find one: / })[0];
    await user.click(findOne);
    const how = within(card as HTMLElement).getByRole('button', { name: /Hide steps/ });
    expect(how).toHaveAttribute('aria-expanded', 'true');
    const panel = document.getElementById(how.getAttribute('aria-controls')!)!;
    expect(panel).toHaveFocus();
    expect(within(panel).getByRole('heading', { level: 3, name: /^1 ·/ })).toBeInTheDocument();
    (document.activeElement as HTMLElement).blur();
    await user.click(findOne);
    expect(how).toHaveAttribute('aria-expanded', 'true');
    expect(panel).toHaveFocus();
  });

  it('puts focus back on the card button when Show me how closes', async () => {
    const user = userEvent.setup();
    renderPlan();
    const button = screen.getAllByRole('button', { name: /Show me how/ })[0];
    await user.click(button);
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(button).toHaveFocus();
  });

  it('does not reopen a card that left the list when it comes back', async () => {
    const user = userEvent.setup();
    renderPlan();
    await user.click(screen.getAllByRole('button', { name: /Show me how/ })[0]);
    await user.click(screen.getByRole('button', { name: 'Factory goods (P2)' }));
    await user.click(screen.getByRole('button', { name: 'Anything' }));
    expect(document.querySelector('section[id^="find-how-"]')).toBeNull();
  });

  it('remembers the Highsec only choice across cards', async () => {
    const user = userEvent.setup();
    renderPlan();
    await user.click(screen.getAllByRole('button', { name: /Show me how/ })[0]);
    await user.click(screen.getByRole('checkbox', { name: 'Highsec only' }));
    await user.click(screen.getAllByRole('button', { name: /Show me how/ })[1]);
    expect(screen.getByRole('checkbox', { name: 'Highsec only' })).not.toBeChecked();
  });

  it('turns Highsec only on for a highsec home and off for nullsec, with the skyhook note', async () => {
    const user = userEvent.setup();
    renderPlan();
    await user.click(screen.getAllByRole('button', { name: /Show me how/ })[0]);
    expect(finderArgs?.highsecOnly).toBe(true);
    expect(screen.getByRole('checkbox', { name: 'Highsec only' })).toBeChecked();
    expect(screen.queryByText(/Skyhook/)).not.toBeInTheDocument();
  });

  it('defaults Highsec only off at a nullsec origin and notes Skyhooks', async () => {
    mockOrigin = { ...mockOrigin, name: 'X-7OMU', security: -0.4 };
    const user = userEvent.setup();
    renderPlan();
    await user.click(screen.getAllByRole('button', { name: /Show me how/ })[0]);
    expect(screen.getByRole('checkbox', { name: 'Highsec only' })).not.toBeChecked();
    expect(screen.getByText(/Skyhook/)).toBeInTheDocument();
    mockOrigin = { ...mockOrigin, name: 'Hek', security: 0.9 };
  });

  it('says so when it cannot tell where the pilot is', async () => {
    mockOrigin = { status: 'unknown', systemId: null, name: null, security: null, source: null };
    const user = userEvent.setup();
    renderPlan();
    await user.click(screen.getAllByRole('button', { name: /Show me how/ })[0]);
    expect(screen.getByText(/We can't tell where you are/)).toBeInTheDocument();
    mockOrigin = { ...mockOrigin, status: 'known', systemId: 30000142, name: 'Hek', security: 0.9 };
  });

  it('pre-marks colony types, offers what-if chips and labels what a what-if unlocks', async () => {
    const user = userEvent.setup();
    renderPlan(snapshot(['oceanic']));
    const types = screen.getByRole('group', { name: 'Your planet types' });
    expect(within(types).getAllByRole('button')).toHaveLength(1);
    const lava = screen.getByRole('button', { name: /\+ Lava/ });
    expect(lava).toHaveTextContent('unlocks 2');
    await user.click(lava);
    expect(lava).toHaveAttribute('aria-pressed', 'true');
    expect(lava).toHaveTextContent('2 new');
    expect(screen.getAllByText('New with this planet')).toHaveLength(2);
  });

  it('says the pilot already makes the best thing', () => {
    mockState = {
      status: 'ready',
      advice: advice({
        colonies: [{ sells: [PROTEINS] }] as unknown as PlanAdvice['colonies'],
      }),
      pricesFetchedAt: new Date(),
      hubName: 'Jita',
    };
    renderPlan(snapshot(['oceanic']));
    expect(screen.getByText(/already making the best thing/)).toBeInTheDocument();
  });

  it('lists every product by tier under All products', async () => {
    const user = userEvent.setup();
    renderPlan();
    await user.click(screen.getByRole('button', { name: 'All products' }));
    expect(screen.getByRole('region', { name: 'Raw' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Advanced' })).toBeInTheDocument();
    expect(screen.getAllByText('Raw: huge volume, thin market').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/needs \d+ planets/).length).toBeGreaterThan(0);
  });

  it('shows the loading and error states', () => {
    mockState = { status: 'loading' };
    const { rerender } = renderPlan();
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    mockState = { status: 'error' };
    rerender(
      <MemoryRouter>
        <FindBestPlan snapshot={snapshot()} characterId={1} />
      </MemoryRouter>
    );
    expect(screen.getByText("Couldn't build the ranking")).toBeInTheDocument();
  });

  it('names the chosen hub in the ranking basis, and the buyback once selected', () => {
    mockState = {
      status: 'ready',
      advice: advice(),
      pricesFetchedAt: new Date(),
      hubName: 'Amarr',
    };
    const { unmount } = renderPlan();
    expect(screen.getAllByText(/Amarr prices/).length).toBeGreaterThan(0);
    expect(document.body).not.toHaveTextContent(/Jita/);
    unmount();

    usePiSettings.setState({ value: { ...DEFAULT_PI_SETTINGS, buybackPct: 85 }, hydrated: true });
    mockState = { ...mockState, hubName: 'Jita' } as PlanAdviceState;
    renderPlan();
    expect(screen.getAllByText(/your corp buyback rate/).length).toBeGreaterThan(0);
    expect(document.body).not.toHaveTextContent(/Jita/);
  });
});
