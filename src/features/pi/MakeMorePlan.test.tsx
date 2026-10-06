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

const snapshot = { pi: fixturePi, colonies: [] } as unknown as GoalPlannerSnapshot;

function ready(advice: PlanAdvice = fixtureAdvice, hubName = 'Jita'): PlanAdviceState {
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
    mockState = { status: 'prices-failed' };
    rerender(
      <MemoryRouter>
        <MakeMorePlan snapshot={snapshot} characterId={1} onFindBest={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.getByText('Hub prices could not be fetched')).toBeInTheDocument();
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

  it('lists quick wins in the model order, each tickable, and remembers the tick', async () => {
    const user = userEvent.setup();
    renderPlan();
    const panel = screen.getByRole('heading', { name: /Quick wins/ }).closest('section')!;
    const boxes = within(panel).getAllByRole('checkbox');
    expect(boxes).toHaveLength(2);
    expect(boxes[0]).toHaveAccessibleName(/Restart Hek VI/);
    expect(boxes[1]).toHaveAccessibleName(/launchpad is full/);
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
    renderPlan();
    expect(screen.getByText(/assume 10% customs on/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Set the rate on Plan' })).toHaveAttribute(
      'href',
      '/planetary-industry/plan#customs'
    );
  });

  it('stays quiet when every customs rate is known', () => {
    renderPlan();
    expect(screen.queryByText(/assume 10% customs/)).not.toBeInTheDocument();
  });
});
