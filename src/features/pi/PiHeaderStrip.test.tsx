import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import { PiHeaderStrip } from './PiHeaderStrip';
import { DEFAULT_PI_SETTINGS, usePiSettings } from './piSettings';

const routes = vi.hoisted(() => ({ jumps: {} as Record<number, number> }));
// One object for every render, as the real hook's memoised basis is: a fresh one
// each call re-ran the strip's route effects on every render, endlessly.
const basis = vi.hoisted(() => ({ rules: {}, network: {}, key: 'k', hydrated: true }));
vi.mock('@/features/route/jumpBasis', () => ({ useSharedJumpBasis: () => basis }));
vi.mock('@/features/route/routeExposure', () => ({
  routeExposure: vi.fn(async (_from: number, to: number) => {
    const n = routes.jumps[to];
    if (n === undefined) return { kind: 'unknown' };
    return {
      kind: 'known',
      path: Array.from({ length: n + 1 }, () => ({ security: 0.9 })),
    };
  }),
}));

const located = vi.hoisted(() => ({ systemId: null as number | null, calls: [] as number[] }));
vi.mock('@/features/character/location', () => ({
  loadCharacterSolarSystemId: vi.fn(async (characterId: number) => {
    located.calls.push(characterId);
    return located.systemId;
  }),
}));
vi.mock('@/features/character/systemSecurity', () => ({
  loadSystemNameAndSecurity: vi.fn(async (id: number) =>
    id === 30004759 ? { name: '1DQ1-A', security: -0.4 } : { name: 'Jita', security: 0.9 }
  ),
}));

beforeEach(async () => {
  routes.jumps = {};
  located.systemId = null;
  located.calls = [];
  await db.settings.clear();
  usePiSettings.setState({ value: DEFAULT_PI_SETTINGS, hydrated: false });
});

/**
 * Lets the strip's async work finish before a test asserts something is absent:
 * first the settings store's own read of Dexie (a read still in flight would
 * land on top of a `setState` made afterwards and revert it), then the mocked
 * route and location lookups, which resolve within one macrotask.
 */
async function settled() {
  await waitFor(() => expect(usePiSettings.getState().hydrated).toBe(true));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

function renderStrip(props: Parameters<typeof PiHeaderStrip>[0]) {
  return render(
    <MemoryRouter>
      <PiHeaderStrip {...props} />
    </MemoryRouter>
  );
}

/** The facts popover behind the strip's "i" (home, colonies, route, EVE time). */
async function openFacts() {
  await userEvent.click(await screen.findByRole('button', { name: 'Home, colonies and route' }));
  return screen.findByTestId('pi-strip-facts');
}

describe('PiHeaderStrip', () => {
  it('labels the route measure the home route, so it is not read as the Hauling figure', async () => {
    usePiSettings.setState({ value: { ...DEFAULT_PI_SETTINGS, buybackPct: 85 }, hydrated: true });
    renderStrip({ colonySystemIds: [30000142], estimate: false });
    const facts = await openFacts();
    expect(within(facts).getByText('Home route')).toBeInTheDocument();
    expect(within(facts).queryByText('Route')).not.toBeInTheDocument();
  });

  it('keeps one slim row: no PI settings link (the page gear is the only entry), facts behind an i', async () => {
    renderStrip({ colonySystemIds: [30000142], estimate: true });
    const strip = await screen.findByTestId('pi-header-strip');
    expect(screen.queryByRole('button', { name: /PI settings/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole('combobox', { name: 'Where do you sell?' })).toHaveLength(1);
    // Home and the colony count are not at a glance: they wait behind the "i".
    expect(within(strip).queryByText('Colonies')).not.toBeInTheDocument();
    const facts = await openFacts();
    expect(within(facts).getByText('Colonies')).toBeInTheDocument();
    expect(await within(facts).findByText('Jita')).toBeInTheDocument();
  });

  it('shows the Est. badge as a chip whose tooltip explains the estimate', async () => {
    renderStrip({ colonySystemIds: [], estimate: true });
    const strip = await screen.findByTestId('pi-header-strip');
    const chip = within(strip).getByRole('button', { name: 'Estimated prices' });
    expect(chip).toHaveTextContent(/est\./i);
    await userEvent.hover(chip);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(/projection from current market/i);
  });

  it('shows EVE time where asked (Colonies), and only there', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-06T12:00:00Z'));
    try {
      const { unmount } = renderStrip({ colonySystemIds: [], estimate: false, eveTime: true });
      const facts = await openFacts();
      expect(within(facts).getByText('EVE time')).toBeInTheDocument();
      expect(within(facts).getByText('Tue 12:00')).toBeInTheDocument();
      unmount();
      renderStrip({ colonySystemIds: [], estimate: false });
      await openFacts();
      expect(screen.queryByText('EVE time')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows no estimate note on tabs without projections', async () => {
    renderStrip({ colonySystemIds: [], estimate: false });
    await screen.findByTestId('pi-header-strip');
    expect(screen.queryByRole('button', { name: 'Estimated prices' })).not.toBeInTheDocument();
  });

  describe('nearest hub suggestion', () => {
    const HEK = 30002053;
    const JITA = 30000142;
    const strip = () => (
      <MemoryRouter>
        <PiHeaderStrip colonySystemIds={[31000005]} estimate={false} />
      </MemoryRouter>
    );

    it('suggests a nearer hub, with why, and accepting picks it', async () => {
      routes.jumps = { [JITA]: 28, [HEK]: 9 };
      render(strip());
      const hint = await screen.findByTestId('pi-nearest-hub');
      expect(hint).toHaveTextContent('Nearest hub: Hek, 9 jumps');
      await userEvent.click(within(hint).getByRole('button', { name: 'Sell at Hek' }));
      expect(usePiSettings.getState().value).toMatchObject({ hub: 'hek', hubChosen: true });
      await waitFor(() => expect(screen.queryByTestId('pi-nearest-hub')).not.toBeInTheDocument());
    });

    it('keeping the current hub dismisses it for good', async () => {
      routes.jumps = { [JITA]: 28, [HEK]: 9 };
      render(strip());
      await userEvent.click(await screen.findByRole('button', { name: 'Keep Jita' }));
      expect(usePiSettings.getState().value).toMatchObject({ hub: 'jita', hubChosen: true });
    });

    it('stays quiet when the current hub is nearest, the choice is made, or no route is known', async () => {
      routes.jumps = { [JITA]: 3, [HEK]: 9 };
      const { unmount } = render(strip());
      await screen.findByTestId('pi-header-strip');
      await settled();
      expect(screen.queryByTestId('pi-nearest-hub')).not.toBeInTheDocument();
      unmount();

      routes.jumps = { [HEK]: 1 };
      usePiSettings.setState({
        value: { ...DEFAULT_PI_SETTINGS, hubChosen: true },
        hydrated: true,
      });
      const second = render(strip());
      await settled();
      expect(screen.queryByTestId('pi-nearest-hub')).not.toBeInTheDocument();
      second.unmount();

      routes.jumps = {};
      usePiSettings.setState({ value: DEFAULT_PI_SETTINGS, hydrated: true });
      render(strip());
      await settled();
      expect(screen.queryByTestId('pi-nearest-hub')).not.toBeInTheDocument();
    });
  });

  describe('home for a pilot with no colonies', () => {
    const NULLSEC = 30004759;
    const HEK = 30002053;
    const JITA = 30000142;

    it("stands in the pilot's location, labelled as such, and finds the nearest hub from it", async () => {
      located.systemId = NULLSEC;
      routes.jumps = { [JITA]: 40, [HEK]: 22 };
      renderStrip({ colonySystemIds: [], locationCharacterId: 91, estimate: false });
      const facts = await openFacts();
      expect(await within(facts).findByText('1DQ1-A')).toBeInTheDocument();
      expect(within(facts).getByText('Location')).toBeInTheDocument();
      expect(within(facts).queryByText('Home')).not.toBeInTheDocument();
      expect(await screen.findByTestId('pi-nearest-hub')).toHaveTextContent(
        'Nearest hub: Hek, 22 jumps'
      );
      expect(within(facts).getByText('Route from here')).toBeInTheDocument();
      expect(located.calls).toEqual([91]);
    });

    it('asks for no location while the colonies are unknown or the pilot has some', async () => {
      located.systemId = NULLSEC;
      const { unmount } = renderStrip({ colonySystemIds: [], estimate: false });
      await screen.findByTestId('pi-header-strip');
      unmount();
      renderStrip({ colonySystemIds: [JITA], locationCharacterId: 91, estimate: false });
      const facts = await openFacts();
      expect(await within(facts).findByText('Home')).toBeInTheDocument();
      expect(located.calls).toEqual([]);
    });

    it('shows no home, and never assumes a hub, when the location is unknown', async () => {
      renderStrip({ colonySystemIds: [], locationCharacterId: 91, estimate: false });
      await waitFor(() => expect(located.calls).toEqual([91]));
      await settled();
      const facts = await openFacts();
      expect(within(facts).queryByText('Location')).not.toBeInTheDocument();
      expect(within(facts).queryByText('Home')).not.toBeInTheDocument();
      expect(screen.queryByTestId('pi-nearest-hub')).not.toBeInTheDocument();
    });
  });
});
