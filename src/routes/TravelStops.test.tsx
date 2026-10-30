import { describe, expect, it, beforeEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { db } from '@/db';
import { stubViewport } from '@/test/viewport';
import { AVOIDED_SYSTEMS_KEY, useAvoidedSystems } from '@/features/route/avoidedSystems';
import {
  AVOIDED_SYSTEMS_ENABLED_KEY,
  clearPodKillsLoad,
  ROUTE_RULE_STORES,
  useAvoidEdencom,
  useAvoidedSystemsEnabled,
  useDefaultRoutePreference,
} from '@/features/route/routeRules';
import { PHONE_QUERY } from '@/lib/useIsPhone';
import { routeFact, visit, systemPickerInput, installTravelHarness } from '@/test/travelPage';
import {
  JITA,
  PERIMETER,
  UEDAMA,
  THERA,
  NIYABAINEN,
  MUVOLAILEN,
  SOBASEKI,
  UEDAMA_STATION,
  SOBASEKI_STATION,
  loadSolarSystemJumps,
} from '@/test/travelMocks';

vi.mock('virtual:pwa-register/react', async () =>
  (await import('@/test/travelMocks')).pwaRegisterMock()
);
vi.mock('@/sde/loadSde', async () => (await import('@/test/travelMocks')).loadSdeMock());
vi.mock('@/features/travel/useLawlessSystems', async () =>
  (await import('@/test/travelMocks')).lawlessSystemsMock()
);
vi.mock('@/sde/loadMarketSde', async (importOriginal) =>
  (await import('@/test/travelMocks')).loadMarketSdeMock(
    await importOriginal<typeof import('@/sde/loadMarketSde')>()
  )
);
vi.mock('@/features/market/useHaulingScan', async () =>
  (await import('@/test/travelMocks')).haulingScanMock()
);
vi.mock('@/features/market/useHaulingFillScan', async () =>
  (await import('@/test/travelMocks')).haulingFillScanMock()
);
vi.mock('@/features/market/useHubJumps', async () =>
  (await import('@/test/travelMocks')).hubJumpsMock()
);

installTravelHarness();

describe('Travel › Route Safety › Stops', () => {
  /** Uedama ─ Perimeter ─ Jita ─ Niyabainen ─ Muvolailen ─ Sobaseki, and Thera with no gates. */
  const LINE = {
    [UEDAMA]: [PERIMETER],
    [PERIMETER]: [UEDAMA, JITA],
    [JITA]: [PERIMETER, NIYABAINEN],
    [NIYABAINEN]: [JITA, MUVOLAILEN],
    [MUVOLAILEN]: [NIYABAINEN, SOBASEKI],
    [SOBASEKI]: [MUVOLAILEN],
    [THERA]: [],
  };

  beforeEach(() => {
    loadSolarSystemJumps.mockResolvedValue(LINE);
  });

  const stopsInLink = () => new URLSearchParams(window.location.search).get('stops');

  function legHeader(name: RegExp) {
    return within(screen.getByRole('list', { name: 'Itinerary by leg' })).getByRole('button', {
      name,
    });
  }

  it('lists the trip by leg, the first open, under facts covering the whole trip', async () => {
    const user = userEvent.setup({ delay: null });
    visit(`?from=${JITA}&stops=${SOBASEKI},${UEDAMA}`);

    expect(await screen.findByRole('table', { name: 'Systems on leg 1' })).toBeInTheDocument();
    expect(legHeader(/^Leg 1 · Jita → Sobaseki · 3 j/)).toHaveAttribute('aria-expanded', 'true');
    const second = legHeader(
      /^Leg 2 · Sobaseki → Uedama · 5 j · lowest 0\.5 · Gank Chokepoints: Uedama/
    );
    expect(second).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('table', { name: 'Systems on leg 2' })).not.toBeInTheDocument();

    expect(routeFact('Jumps')).toBe('8');
    expect(screen.getAllByTestId('route-strip-cell')).toHaveLength(9);

    await user.click(second);
    expect(screen.getByRole('table', { name: 'Systems on leg 2' })).toBeInTheDocument();
  });

  it('previews an Avoid as the whole trip, not the leg it was asked from', async () => {
    const user = userEvent.setup({ delay: null });
    visit(`?from=${JITA}&stops=${SOBASEKI},${UEDAMA}`);

    const table = await screen.findByRole('table', { name: 'Systems on leg 1' });
    await user.click(await within(table).findByRole('button', { name: /^2 systems/ }));
    await user.click(within(table).getByRole('button', { name: 'Avoid Niyabainen' }));
    const dialog = await screen.findByRole('dialog', { name: 'Avoid Niyabainen?' });

    expect(
      await within(dialog).findByText(/^The route becomes 8 jumps \(\+0\)/)
    ).toBeInTheDocument();
  });

  it('adds a stop from the picker, writing the stops into the link', async () => {
    const user = userEvent.setup({ delay: null });
    visit(`?from=${JITA}&to=${UEDAMA}`);

    await screen.findByRole('table', { name: 'Systems on the route' });
    await user.click(screen.getByRole('button', { name: /^add stop/i }));
    await user.type(await systemPickerInput(), 'Sobas');
    await user.click(await screen.findByRole('option', { name: /Sobaseki/ }));

    expect(stopsInLink()).toBe(`${UEDAMA},${SOBASEKI}`);
    expect(new URLSearchParams(window.location.search).get('to')).toBeNull();
    expect(await screen.findByRole('list', { name: 'Itinerary by leg' })).toBeInTheDocument();
  });

  it('adds a station as a stop, tagging it in the link and marking it in the list', async () => {
    const user = userEvent.setup({ delay: null });
    visit(`?from=${JITA}&to=${UEDAMA}`);

    await screen.findByRole('table', { name: 'Systems on the route' });
    await user.click(screen.getByRole('button', { name: /^add stop/i }));
    await user.type(await systemPickerInput(), 'Crown Ex');
    await user.click(await screen.findByRole('option', { name: /Crown Exchange/ }));

    expect(stopsInLink()).toBe(`${UEDAMA},${SOBASEKI}:${SOBASEKI_STATION}`);
    const stops = await screen.findByRole('list', { name: 'Stops, in the order typed' });
    expect(within(stops).getByText('Crown Exchange')).toBeInTheDocument();
  });

  it('shows a link’s station stop by name in the stop list and the leg list', async () => {
    visit(`?from=${JITA}&stops=${UEDAMA}:${UEDAMA_STATION},${SOBASEKI}`);

    const legs = await screen.findByRole('list', { name: 'Itinerary by leg' });
    expect((await within(legs).findAllByText(/Nova Depot/)).length).toBeGreaterThan(0);
    expect(
      within(screen.getByRole('list', { name: 'Stops, in the order typed' })).getByText(
        'Nova Depot'
      )
    ).toBeInTheDocument();
  });

  it('opens a link with a station tag the pilot cannot name as its plain system', async () => {
    visit(`?from=${JITA}&stops=${UEDAMA}:60000999`);

    await screen.findByRole('table', { name: 'Systems on the route' });
    expect(
      within(screen.getByRole('list', { name: 'Stops, in the order typed' })).getByText('Uedama')
    ).toBeInTheDocument();
  });

  it('removes a stop with its row button, and reorders only by the drag handle', async () => {
    const user = userEvent.setup({ delay: null });
    visit(`?from=${JITA}&stops=${UEDAMA},${SOBASEKI}`);

    expect(await screen.findByRole('button', { name: 'Reorder Sobaseki' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Move / })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove Uedama' }));
    expect(stopsInLink()).toBe(String(SOBASEKI));
    // One stop is the page as it always was.
    expect(await screen.findByRole('table', { name: 'Systems on the route' })).toBeInTheDocument();
  });

  it('optimizes the stop order and says what changed', async () => {
    const user = userEvent.setup({ delay: null });
    visit(`?from=${JITA}&stops=${SOBASEKI},${UEDAMA},${NIYABAINEN}&pref=shortest`);

    await screen.findByRole('list', { name: 'Itinerary by leg' });
    await user.click(screen.getByRole('switch', { name: 'Optimize stop order' }));

    expect(new URLSearchParams(window.location.search).get('opt')).toBe('1');
    expect(
      await screen.findByText(
        'Order changed: Uedama → Niyabainen → Sobaseki · 11 jumps in typed order → 7 jumps'
      )
    ).toBeInTheDocument();
    expect(legHeader(/^Leg 1 · Jita → Uedama/)).toBeInTheDocument();
    // The typed order stays in the link and the list.
    expect(stopsInLink()).toBe(`${SOBASEKI},${UEDAMA},${NIYABAINEN}`);
  });

  it('keeps the last stop last when asked', async () => {
    visit(`?from=${JITA}&stops=${SOBASEKI},${UEDAMA},${NIYABAINEN}&pref=shortest&opt=1&keep=1`);

    expect(
      await screen.findByText(
        'Order changed: Uedama → Sobaseki → Niyabainen · 11 jumps in typed order → 9 jumps'
      )
    ).toBeInTheDocument();
  });

  it('leaves zero kill counts off a phone row, keeping its jumps', async () => {
    const restoreViewport = stubViewport(PHONE_QUERY);
    try {
      visit(`?from=${JITA}&to=${UEDAMA}`);

      const table = await screen.findByRole('table', { name: 'Systems on the route' });
      const body = (await within(table).findAllByRole('row')).slice(1);
      const lastHour = (row: HTMLElement) => within(row).getAllByRole('cell')[3];
      await waitFor(() => expect(lastHour(body[2])).toHaveTextContent('12ship kills'));
      expect(lastHour(body[2])).toHaveTextContent('4pod kills');
      expect(lastHour(body[0])).toHaveTextContent('4,200jumps');
      expect(lastHour(body[0])).not.toHaveTextContent('ship kills');
      expect(lastHour(body[0])).not.toHaveTextContent('pod kills');
    } finally {
      restoreViewport();
    }
  });

  it('colors the last hour: ship kills by a heat ramp, any pod kill red', async () => {
    visit(`?from=${JITA}&to=${UEDAMA}`);

    const table = await screen.findByRole('table', { name: 'Systems on the route' });
    const body = (await within(table).findAllByRole('row')).slice(1);
    const lastHour = (row: HTMLElement) => within(row).getAllByRole('cell')[3];
    await waitFor(() => expect(lastHour(body[2])).toHaveTextContent('12'));

    // 12 ship kills is past the red stop; 4 pod kills is red outright.
    expect(within(lastHour(body[2])).getByText('12')).toHaveStyle({ color: '#ff7369' });
    expect(within(lastHour(body[2])).getByText('4')).toHaveClass('text-danger');
    // A quiet system keeps the default text.
    const quiet = within(lastHour(body[0])).getAllByText('0');
    for (const figure of quiet) {
      expect(figure).not.toHaveClass('text-danger');
      expect(figure.getAttribute('style')).toBeNull();
    }
  });

  it('folds the stops to one line on a phone, with Edit to open them', async () => {
    const restoreViewport = stubViewport(PHONE_QUERY);
    try {
      const user = userEvent.setup({ delay: null });
      visit(`?stops=${SOBASEKI},${UEDAMA}`);

      expect(await screen.findByText('Jita → 2 stops')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^add stop/i })).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Edit stops' }));
      expect(screen.getByRole('button', { name: /^add stop/i })).toBeInTheDocument();
    } finally {
      restoreViewport();
    }
  });

  it('gives an unreachable stop its leg’s no-route message and turns optimizing off', async () => {
    const user = userEvent.setup({ delay: null });
    visit(`?from=${JITA}&stops=${UEDAMA},${THERA}&opt=1`);

    const leg = await screen.findByRole('button', {
      name: /^Leg 2 · Uedama → Thera · no stargate route/,
    });
    expect(screen.getByRole('switch', { name: 'Optimize stop order' })).toBeDisabled();
    expect(
      screen.getByText(/A stop no stargate route reaches can't be put in order/)
    ).toBeInTheDocument();
    // The reachable leg still draws.
    expect(screen.getByRole('table', { name: 'Systems on leg 1' })).toBeInTheDocument();

    await user.click(leg);
    expect(screen.getByText(/No stargate route connects Uedama and Thera/)).toBeInTheDocument();
  });
});

describe('Travel › Route Safety › Route rules', () => {
  beforeEach(() => {
    // The Travel Settings stores outlive a test; make each one read its seeded rows afresh.
    for (const store of ROUTE_RULE_STORES) {
      (store.setState as (partial: { hydrated: boolean }) => void)({ hydrated: false });
    }
    useDefaultRoutePreference.setState({ value: 'prefer-highsec' });
    useAvoidEdencom.setState({ value: false });
    useAvoidedSystems.setState({ value: [] });
    useAvoidedSystemsEnabled.setState({ value: true });
    clearPodKillsLoad();
  });

  async function avoidButton(name: string) {
    const table = await screen.findByRole('table', { name: 'Systems on the route' });
    return within(table).findByRole('button', { name: `Avoid ${name}` });
  }

  it('saves the Route Preference as the pilot default and drops the link override', async () => {
    const user = userEvent.setup({ delay: null });
    visit(`?from=${JITA}&to=${UEDAMA}`);

    const group = await screen.findByRole('group', { name: 'Route preference' });
    expect(within(group).getByRole('button', { name: 'Safer' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await user.click(within(group).getByRole('button', { name: 'Shorter' }));

    await waitFor(() => expect(useDefaultRoutePreference.getState().value).toBe('shortest'));
    expect(new URLSearchParams(window.location.search).get('pref')).toBeNull();
    // Prefer shorter counts jumps only, so the penalty is off — as in Settings.
    expect(screen.getByRole('spinbutton', { name: 'Security penalty' })).toBeDisabled();
  });

  it("opens on a link's pref over the saved default, until the picker is used", async () => {
    const user = userEvent.setup({ delay: null });
    visit(`?from=${JITA}&to=${UEDAMA}&pref=shortest`);

    const group = await screen.findByRole('group', { name: 'Route preference' });
    expect(within(group).getByRole('button', { name: 'Shorter' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(useDefaultRoutePreference.getState().value).toBe('prefer-highsec');

    await user.click(within(group).getByRole('button', { name: 'Safer' }));
    await waitFor(() => expect(new URLSearchParams(window.location.search).get('pref')).toBeNull());
    expect(within(group).getByRole('button', { name: 'Safer' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('edits the same Travel Settings Settings → Travel does', async () => {
    const user = userEvent.setup({ delay: null });
    visit(`?from=${JITA}&to=${UEDAMA}`);

    await user.click(
      await screen.findByRole('checkbox', { name: /EDENCOM systems \(137 systems\)/ })
    );

    expect(useAvoidEdencom.getState().value).toBe(true);
  });

  it('offers Avoid on every row but the two ends', async () => {
    visit(`?from=${JITA}&to=${UEDAMA}`);

    await avoidButton('Perimeter');
    const table = screen.getByRole('table', { name: 'Systems on the route' });
    expect(within(table).queryByRole('button', { name: 'Avoid Jita' })).not.toBeInTheDocument();
    expect(within(table).queryByRole('button', { name: 'Avoid Uedama' })).not.toBeInTheDocument();
  });

  it('offers no Avoid for a system already on the Avoided Systems', async () => {
    await db.settings.put({ key: AVOIDED_SYSTEMS_KEY, value: [PERIMETER] });
    visit(`?from=${JITA}&to=${UEDAMA}`);

    const table = await screen.findByRole('table', { name: 'Systems on the route' });
    await within(table).findByText('Perimeter');
    expect(
      within(table).queryByRole('button', { name: 'Avoid Perimeter' })
    ).not.toBeInTheDocument();
  });

  it('previews the route before saving, and says plainly when there is no way around', async () => {
    const user = userEvent.setup({ delay: null });
    visit(`?from=${JITA}&to=${UEDAMA}`);

    await user.click(await avoidButton('Perimeter'));
    const dialog = await screen.findByRole('dialog', { name: 'Avoid Perimeter?' });
    expect(
      await within(dialog).findByText('The route becomes 2 jumps (+0), lowest 0.5')
    ).toBeInTheDocument();
    expect(within(dialog).getByText(/no way around Perimeter/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/the list is still off/)).not.toBeInTheDocument();
    expect(
      within(dialog).getByText(/jump counts change everywhere in the app/)
    ).toBeInTheDocument();
    // Previewing saved nothing.
    expect(useAvoidedSystems.getState().value).toEqual([]);

    await user.click(within(dialog).getByRole('button', { name: 'Avoid Perimeter' }));

    expect(useAvoidedSystems.getState().value).toEqual([PERIMETER]);
    expect(await db.settings.get(AVOIDED_SYSTEMS_KEY)).toMatchObject({ value: [PERIMETER] });
  });

  it('says the Avoided Systems switch is off, and switches it on along with the add', async () => {
    await db.settings.put({ key: AVOIDED_SYSTEMS_ENABLED_KEY, value: false });
    const user = userEvent.setup({ delay: null });
    visit(`?from=${JITA}&to=${UEDAMA}`);

    await user.click(await avoidButton('Perimeter'));
    const dialog = await screen.findByRole('dialog', { name: 'Avoid Perimeter?' });
    expect(within(dialog).getByText(/Avoided Systems is switched off/)).toBeInTheDocument();
    await within(dialog).findByText(/The route becomes 2 jumps/);
    // Each button carries its own outcome.
    const switchOn = within(dialog).getByRole('group', { name: 'Switch on and avoid' });
    expect(within(switchOn).getByText(/The route becomes 2 jumps/)).toBeInTheDocument();
    const listOnly = within(dialog).getByRole('group', { name: 'Add to the list only' });
    expect(
      within(listOnly).getByText(/The route stays at 2 jumps \(\+0\): the list is still off/)
    ).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Switch on and avoid' }));

    expect(useAvoidedSystems.getState().value).toEqual([PERIMETER]);
    await waitFor(() => expect(useAvoidedSystemsEnabled.getState().value).toBe(true));
  });
});
