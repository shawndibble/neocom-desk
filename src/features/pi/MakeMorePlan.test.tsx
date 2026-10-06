import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { PlanAdviceState } from './usePlanAdvice';
import type { GoalPlannerSnapshot } from './goalPlannerSnapshot';
import { MakeMorePlan } from './MakeMorePlan';
import { usePlanPreference, usePlanTicks } from './planTicksPref';
import { P2_B, RAW, fixtureAdvice, fixturePi } from './planViewFixture';
import type { PlanAdvice } from './planAdviceModel';
import type { QuickWin } from '@/engine/pi/planAdvice';
import { DEFAULT_PI_SETTINGS, usePiSettings } from './piSettings';

let mockState: PlanAdviceState = { status: 'loading' };
vi.mock('./usePlanAdvice', () => ({ usePlanAdvice: () => mockState }));

const CONDENSATES = 2344;
// A chain across both fixture colonies earning far more than both together: if any of it
// leaked into a headline, quick win or total, the figures below would move.
vi.mock('./useBiggerChains', () => ({
  useBiggerChains: () => ({
    estimates: new Map([
      [
        2344,
        {
          colonies: {
            typeId: 2344,
            iskPerDay: 9_000_000,
            unitsPerDay: 10,
            planetIds: [1, 2],
            hostId: 1,
            m3PerWeek: 700,
            legs: [{ from: 2, to: 1, jumps: 3 }],
          },
          newPlanets: null,
        },
      ],
    ]),
    candidateCount: 1,
    pending: false,
  }),
  NO_TYPES: [],
  // A what-if planet's chain, as large: it must not move them either.
  useWhatIfChains: () => ({
    byType: new Map([
      [
        'lava',
        new Map([
          [
            2345,
            {
              colonies: {
                typeId: 2345,
                iskPerDay: 9_000_000,
                unitsPerDay: 10,
                planetIds: [-1, 1],
                hostId: 1,
                m3PerWeek: 700,
                legs: [{ from: -1, to: 1, jumps: null }],
              },
              newPlanets: null,
            },
          ],
        ]),
      ],
    ]),
    pending: false,
  }),
}));

const snapshot = { pi: fixturePi, colonies: [] } as unknown as GoalPlannerSnapshot;

const withChains = {
  ...fixtureAdvice,
  chainBasis: {
    haulDays: 7,
    books: { prices: {}, revenuePrices: { 2344: 100_000 }, salesTaxPct: 4 },
  },
  chainColonies: [],
} as unknown as PlanAdvice;

function ready(advice: PlanAdvice = withChains, hubName = 'Jita'): PlanAdviceState {
  return { status: 'ready', advice, pricesFetchedAt: new Date(), hubName };
}

function renderPlan(path = '/', onFindBest = vi.fn()) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <MakeMorePlan snapshot={snapshot} characterId={1} onFindBest={onFindBest} />
    </MemoryRouter>
  );
}

beforeEach(async () => {
  mockState = ready();
  Element.prototype.scrollIntoView = vi.fn();
  usePiSettings.setState({ value: DEFAULT_PI_SETTINGS, hydrated: true });
  await usePlanTicks.getState().setValue([]);
  await usePlanPreference.getState().setValue('isk');
});

describe('MakeMorePlan', () => {
  it('gives each panel one ISK tab stop, and the exact figure still shows on focus', async () => {
    const { container } = renderPlan();
    const figures = container.querySelectorAll('[data-isk-figure]');
    expect(figures.length).toBeGreaterThan(1);
    // At most one stop per panel, never one per figure.
    const stops = container.querySelectorAll('[data-isk-figure][tabindex="0"]');
    expect(stops.length).toBeGreaterThan(0);
    expect(stops.length).toBeLessThan(figures.length);
    expect(stops.length).toBeLessThanOrEqual(5);
    expect(container.querySelector('.sr-only')?.textContent).toBeTruthy();
    (stops[0] as HTMLElement).focus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent(/ISK/);
  });

  it('shows the loading, prices-failed and error states', () => {
    mockState = { status: 'loading' };
    const { rerender } = renderPlan();
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    mockState = { status: 'prices-failed', advice: null };
    rerender(
      <MemoryRouter>
        <MakeMorePlan snapshot={snapshot} characterId={1} onFindBest={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.getByText('Hub prices could not be fetched')).toBeInTheDocument();
  });

  it('with prices down keeps the wins that need no price, with no gain and no other figure', () => {
    const unpriced = {
      ...fixtureAdvice,
      colonies: fixtureAdvice.colonies.map((colony) => ({
        ...colony,
        quickWins: colony.quickWins.map((win) => ({
          ...win,
          gainPerDay: null,
          iskPerMinute: null,
        })),
      })),
    } as unknown as PlanAdvice;
    mockState = { status: 'prices-failed', advice: unpriced };
    const { container } = renderPlan();
    expect(screen.getByText('Hub prices could not be fetched')).toBeInTheDocument();
    const panel = screen.getByRole('heading', { name: /Quick wins/ }).closest('section')!;
    expect(within(panel).getAllByRole('checkbox')).toHaveLength(2);
    expect(panel).not.toHaveTextContent(/ISK/);
    expect(panel).not.toHaveTextContent('No ISK figure');
    expect(container.querySelector('[data-isk-figure]')).toBeNull();
    expect(screen.queryByRole('heading', { name: /Rebuild/ })).not.toBeInTheDocument();
  });

  it('with prices down and nothing price-free to do, shows only the notice', () => {
    mockState = {
      status: 'prices-failed',
      advice: { ...fixtureAdvice, colonies: [] } as unknown as PlanAdvice,
    };
    renderPlan();
    expect(screen.getByText('Hub prices could not be fetched')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Quick wins/ })).not.toBeInTheDocument();
  });

  it('puts "What matters more?" on its own row in the body below sm, not in the header', () => {
    renderPlan();
    const row = screen.getByTestId('pi-matters-row');
    expect(within(row).getByRole('group', { name: 'What matters more?' })).toBeInTheDocument();
    expect(screen.getAllByRole('group', { name: 'What matters more?' })).toHaveLength(1);
  });

  it('announces the headline in a live region', () => {
    renderPlan();
    const live = screen.getByRole('status');
    expect(live).toHaveTextContent(/Quick wins add .* ISK a day/);
    expect(live).toHaveTextContent(/Rebuilding 1 planet adds/);
  });

  it('gives quick wins with no ISK gain their time only, never "add 0 ISK"', () => {
    mockState = ready({
      ...fixtureAdvice,
      colonies: fixtureAdvice.colonies.map((colony) => ({
        ...colony,
        quickWinGainPerDay: 0,
        quickWins: colony.quickWins.map((win) => ({
          ...win,
          gainPerDay: null,
          iskPerMinute: null,
        })),
      })),
    } as unknown as PlanAdvice);
    renderPlan();
    const live = screen.getByRole('status');
    expect(live).toHaveTextContent(/Quick wins take about \d+ minutes\./);
    expect(live).not.toHaveTextContent(/add 0/);
  });

  it('leaves quick wins out of the live region when there are none', () => {
    mockState = ready({
      ...fixtureAdvice,
      quickWins: [],
      colonies: fixtureAdvice.colonies.map((c) => ({ ...c, quickWins: [] })),
    } as unknown as PlanAdvice);
    renderPlan();
    const live = screen.getByRole('status');
    expect(live).not.toHaveTextContent(/Quick wins add/);
    expect(live).toHaveTextContent(/Rebuilding 1 planet adds/);
  });

  it.each([
    [-756_000, /Rebuilding 1 planet costs 756K ISK a day\./],
    [-0.3, /^((?!costs).)*$/s],
  ])('words a rebuild of %d ISK a day as a cost, never "adds -"', (gain, pattern) => {
    const [changing, ...rest] = fixtureAdvice.colonies;
    const advice = {
      ...fixtureAdvice,
      colonies: [
        {
          ...changing,
          rebuild: { ...changing.rebuild, gainPerDay: gain },
        },
        ...rest,
      ],
    } as unknown as PlanAdvice;
    mockState = ready(advice);
    renderPlan();
    const live = screen.getByRole('status');
    expect(live.textContent).toMatch(pattern);
    expect(live.textContent).not.toMatch(/adds -/);
  });

  it('lists quick wins in the model order, each tickable, and remembers the tick', async () => {
    const user = userEvent.setup();
    renderPlan();
    const panel = screen.getByRole('heading', { name: /Quick wins/ }).closest('section')!;
    const boxes = within(panel).getAllByRole('checkbox');
    expect(boxes).toHaveLength(2);
    expect(boxes[0]).toHaveAccessibleName(/Restart Hek VI/);
    expect(boxes[1]).toHaveAccessibleName(/launchpad is full in 16 h, before your daily haul/);
    // A storage win's figure is a saving, a day's worth, and is not in the quick-win total.
    const storageRow = boxes[1].closest('li')!;
    expect(storageRow).toHaveTextContent(/saves ~\s*120.*\/day/);
    await user.click(boxes[0]);
    expect(boxes[0]).toBeChecked();
    await waitFor(() => expect(usePlanTicks.getState().value).toContain('1:restart'));
  });

  it('forgets a tick whose quick win has gone, so a win that returns starts unticked', async () => {
    // Another character's row (planet 9) is not this view's to drop.
    await usePlanTicks.getState().setValue(['1:restart', '1:stale', '9:other']);
    renderPlan();
    await waitFor(() => expect(usePlanTicks.getState().value).toEqual(['1:restart', '9:other']));
  });

  it('says Change for a rebuild and Keep for a colony already on its best', () => {
    renderPlan();
    const cards = screen.getAllByRole('listitem').filter((li) => li.id.startsWith('plan-'));
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveTextContent(/Change Hek VI \(Barren\) to make/);
    expect(cards[0]).toHaveTextContent(/on top of its quick win/);
    expect(cards[0]).toHaveTextContent(/Rebuild/);
    expect(cards[1]).toHaveTextContent(/Keep Uttindar II \(Barren\) on/);
    expect(cards[1]).toHaveTextContent(/already the best earner/);
    expect(cards[1]).toHaveTextContent(/As-is/);
  });

  it('never says Keep on raw ore: a raw-only colony points at the refinement when there is one', () => {
    const [changing, keeping] = fixtureAdvice.colonies;
    const refine = {
      id: '2:room-factories:1',
      planetId: 2,
      detail: {
        kind: 'spare-room',
        what: 'factories',
        productTypeId: P2_B,
        factories: 2,
        source: 'local',
        routedFrom: [],
        needsRemoval: false,
      },
      gainPerDay: 500,
      minutes: 4,
      iskPerMinute: 125,
    } as unknown as QuickWin;
    const cardFor = (colony: typeof keeping) => {
      mockState = ready({ ...fixtureAdvice, colonies: [changing, colony] });
      const { unmount } = renderPlan();
      const card = screen.getAllByRole('listitem').filter((li) => li.id.startsWith('plan-'))[1];
      const text = card.textContent ?? '';
      unmount();
      return text;
    };
    const plain = cardFor({ ...keeping, sells: [RAW] });
    expect(plain).not.toMatch(/Keep Uttindar II/);
    expect(plain).toMatch(/sells raw/);
    expect(plain).not.toMatch(/Refine it/);
    const withWin = cardFor({ ...keeping, sells: [RAW], quickWins: [refine] });
    expect(withWin).toMatch(/Refine it with the quick win above/);
  });

  it('opens an alternative in place and says what it trades', async () => {
    const user = userEvent.setup();
    renderPlan();
    const disclosure = screen.getByRole('button', { name: '1 alternative' });
    expect(disclosure).toHaveAttribute('aria-expanded', 'false');
    await user.click(disclosure);
    expect(disclosure).toHaveAttribute('aria-expanded', 'true');
    const region = document.getElementById(disclosure.getAttribute('aria-controls')!)!;
    expect(region).toHaveTextContent(/earns .*\/day less but hauls 4× less/);
  });

  it('scrolls to the colony a #plan- link names', async () => {
    renderPlan('/#plan-p2');
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
    expect(document.activeElement).toBe(document.getElementById('plan-p2'));
  });

  it('nudges toward the Interplanetary Consolidation skill while planets are free', async () => {
    const onFindBest = vi.fn();
    const user = userEvent.setup();
    renderPlan('/', onFindBest);
    expect(screen.getByText(/You can run up to 4 planets and you're using 2/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Interplanetary Consolidation' })).toHaveAttribute(
      'href',
      expect.stringContaining('info=skill-2495')
    );
    await user.click(screen.getByRole('button', { name: /What should the next planet be/ }));
    expect(onFindBest).toHaveBeenCalled();
  });

  it('says "1 planet", not "1 planets", for a one-planet cap', () => {
    mockState = ready({
      ...fixtureAdvice,
      slots: { ...fixtureAdvice.slots, used: 0, allowed: 1, free: 1 },
    });
    renderPlan();
    expect(screen.getByText(/You can run up to 1 planet and you're using 0/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '0 of 1 planet slot used' })).toBeInTheDocument();
  });

  it('says "1 planet" without a gain figure too', () => {
    mockState = ready({
      ...fixtureAdvice,
      slots: { ...fixtureAdvice.slots, used: 0, allowed: 1, free: 1, gainPerPlanetPerDay: null },
    });
    renderPlan();
    expect(
      screen.getByText(/You can run up to 1 planet and you're using 0\. Each level/)
    ).toBeInTheDocument();
  });

  it('has no nudge when every slot is in use', () => {
    mockState = ready({
      ...fixtureAdvice,
      slots: { ...fixtureAdvice.slots, used: 4, free: 0 },
    });
    renderPlan();
    expect(screen.queryByText(/You can run up to/)).not.toBeInTheDocument();
  });

  it('switches the hauling preference', async () => {
    const user = userEvent.setup();
    renderPlan();
    await user.click(screen.getByRole('button', { name: 'Least hauling' }));
    await waitFor(() => expect(usePlanPreference.getState().value).toBe('haul'));
  });

  it('draws one checklist column per changed colony, with its Command Center fit', () => {
    renderPlan();
    const column = screen.getByRole('region', { name: '1. Hek VI' });
    expect(within(column).getAllByRole('checkbox').length).toBeGreaterThan(0);
    expect(column).toHaveTextContent('Fits your Command Center (upgrade level 4)');
    expect(within(column).getAllByRole('progressbar')).toHaveLength(2);
  });

  it.each([
    [3, 'Upgrade the Command Center to level 4 first (+1 step)'],
    [2, 'Upgrade the Command Center to level 4 first (+2 steps)'],
  ])('words a Command Center upgrade from level %i with the right plural', (from, text) => {
    mockState = ready({
      ...fixtureAdvice,
      colonies: fixtureAdvice.colonies.map((c) =>
        c.rebuild.status === 'change'
          ? { ...c, rebuild: { ...c.rebuild, upgradeFromLevel: from } }
          : c
      ),
    });
    renderPlan();
    const column = screen.getByRole('region', { name: '1. Hek VI' });
    expect(column).toHaveTextContent(text);
    expect(column).not.toHaveTextContent('piPlan.make.fitNeedsUpgrade');
  });

  it('names a hauling problem for the route, in the pilot units', () => {
    renderPlan();
    const haul = screen.getByRole('heading', { name: 'Hauling and upkeep' }).closest('section')!;
    expect(haul).toHaveTextContent('Collected at home');
    expect(haul).toHaveTextContent(/Fits in one trip with an industrial hauler/);
    expect(haul).toHaveTextContent('Frigate cargo ~400 m³');
  });

  it('labels the hauling route as the worst colony, not the home route', () => {
    renderPlan();
    const hauling = screen.getByRole('heading', { name: /Hauling and upkeep/ }).closest('section')!;
    expect(within(hauling).getByText('Worst colony')).toBeInTheDocument();
    expect(within(hauling).queryByText('Route')).not.toBeInTheDocument();
  });

  it('prices at the chosen hub, never a hardcoded Jita', () => {
    mockState = ready(fixtureAdvice, 'Amarr');
    renderPlan();
    expect(screen.getByText(/at Amarr prices\. Estimates\./)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/Jita/);
  });

  it('prices at the corp buyback once that is the market, with no hub named', () => {
    usePiSettings.setState({
      value: { ...DEFAULT_PI_SETTINGS, buybackPct: 85 },
      hydrated: true,
    });
    renderPlan();
    expect(screen.getByText(/at your corp buyback rate\. Estimates\./)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/Jita/);
  });

  it('says it assumes the default customs rate, with a link to the rate editor', () => {
    mockState = ready({
      ...fixtureAdvice,
      colonies: fixtureAdvice.colonies.map((c, i) => (i === 0 ? { ...c, taxAssumed: true } : c)),
    });
    renderPlan('/planetary-industry/plan');
    expect(screen.getByText(/assume 10% customs on/)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Set the rate in “Make a specific product”' })
    ).toHaveAttribute('href', '/planetary-industry/plan#customs');
  });

  it('keeps Bigger chains off until the pilot opts in beside the plan’s preferences', async () => {
    const user = userEvent.setup();
    renderPlan();
    expect(screen.queryByRole('heading', { name: /Bigger chains/ })).not.toBeInTheDocument();
    const optIn = screen.getByRole('checkbox', { name: 'I will haul between my planets' });
    expect(optIn).not.toBeChecked();
    expect(optIn).toHaveAccessibleDescription(/Adds a Bigger chains section/);
    await user.click(optIn);
    await waitFor(() => expect(usePiSettings.getState().value.haulBetweenPlanets).toBe(true));
    expect(await screen.findByRole('heading', { name: /Bigger chains/ })).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'I will haul between my planets' }));
    await waitFor(() => expect(usePiSettings.getState().value.haulBetweenPlanets).toBeUndefined());
  });

  it('draws a chain in its own section and never moves a headline, quick win or total', () => {
    const { unmount } = renderPlan();
    const figures = () => ({
      live: screen.getByRole('status').textContent,
      planets: screen.getByRole('heading', { name: /Your planets/ }).closest('section')!
        .textContent,
      wins: screen.getByRole('heading', { name: /Quick wins/ }).closest('section')!.textContent,
      rebuild: screen.getByRole('heading', { name: /if you want more/i }).closest('section')!
        .textContent,
    });
    const off = figures();
    unmount();

    usePiSettings.setState({
      value: { ...DEFAULT_PI_SETTINGS, haulBetweenPlanets: true },
      hydrated: true,
    });
    renderPlan();
    expect(figures()).toEqual(off);
    const chains = screen.getByRole('heading', { name: /Bigger chains/ }).closest('section')!;
    expect(within(chains).getByRole('link', { name: 'Condensates' })).toHaveAttribute(
      'href',
      expect.stringContaining(String(CONDENSATES))
    );
    expect(chains).toHaveTextContent(/on Hek VI and Uttindar II, with the factories on Hek VI/);
    expect(chains).toHaveTextContent(
      /more than these 2 planets earn on their best one-planet picks/
    );
    expect(chains).toHaveTextContent(/Uttindar II → Hek VI: 3/);
  });

  it('stays quiet when every customs rate is known', () => {
    renderPlan();
    expect(screen.queryByText(/assume 10% customs/)).not.toBeInTheDocument();
  });
});
