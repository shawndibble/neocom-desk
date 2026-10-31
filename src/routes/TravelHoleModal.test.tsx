import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { App } from '@/app/App';
import { stubViewport } from '@/test/viewport';
import { EVE_SCOUT_SIGNATURES_URL } from '@/lib/eveScout';
import { PHONE_QUERY } from '@/lib/useIsPhone';
import { SIGNATURES, server, visit, installTravelHarness } from '@/test/travelPage';
import { JITA, UEDAMA, THERA } from '@/test/travelMocks';

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

describe('Travel › Route Safety › Thera / Turnur modal', () => {
  const MAIN_TABLE = 'Open holes out of Thera and Turnur';
  const JSPACE_TABLE = 'Open holes into J-space';
  const JSPACE_GROUP = /exits? into J-space · no gate route from you/;

  /** The connection ids a table lists, top to bottom. */
  function holesIn(table: HTMLElement) {
    return within(table)
      .getAllByRole('row')
      .map((row) => row.getAttribute('data-row-key'))
      .filter((key) => key !== null);
  }

  function holeRow(id: string) {
    return document.querySelector<HTMLElement>(`tr[data-row-key="${id}"]`)!;
  }

  /** Opens More route options, then the modal from the Browse open wormholes button. */
  async function openFromBrowse(search = `?from=${JITA}`, { phone = false } = {}) {
    visit(search);
    // A phone folds the rules panel until asked.
    if (phone)
      await userEvent
        .setup({ delay: null })
        .click(await screen.findByRole('button', { name: 'Show route rules' }));
    await userEvent
      .setup({ delay: null })
      .click(await screen.findByRole('button', { name: /More route options/ }));
    await userEvent
      .setup({ delay: null })
      .click(await screen.findByRole('button', { name: 'Browse open wormholes' }));
    return screen.findByRole('dialog', { name: 'Thera / Turnur' });
  }

  it('has no Thera / Turnur tab, and an old /travel/thera link lands on Route Safety', async () => {
    window.history.pushState({}, '', `/travel/thera?origin=${JITA}`);
    render(<App />);
    expect(await screen.findByRole('tab', { name: 'Route Safety' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.queryByRole('tab', { name: 'Thera / Turnur' })).not.toBeInTheDocument();
    expect(window.location.pathname).toBe('/travel/route');
    expect(window.location.search).toContain(`from=${JITA}`);
  });

  it('opens from Browse open wormholes, naming where jumps are counted from', async () => {
    const dialog = await openFromBrowse();
    expect(
      within(dialog).getByText('Open holes from EVE-Scout, counted from Jita')
    ).toBeInTheDocument();
    expect(await within(dialog).findByRole('table', { name: MAIN_TABLE })).toBeInTheDocument();
  });

  it('keeps the Route through Thera / Turnur switch a plain switch, outside More route options', async () => {
    visit(`?from=${JITA}`);
    await userEvent
      .setup({ delay: null })
      .click(await screen.findByText('Route through Thera / Turnur'));
    expect(
      await screen.findByRole('checkbox', { name: 'Route through Thera / Turnur' })
    ).toBeChecked();
    expect(screen.queryByRole('dialog', { name: 'Thera / Turnur' })).toBeNull();
  });

  it('lists live K-space holes nearest first, folding J-space exits into a group under them', async () => {
    const dialog = await openFromBrowse();

    const table = await within(dialog).findByRole('table', { name: MAIN_TABLE });
    // Perimeter is one jump from Jita, Uedama two; the expired Jita hole is gone.
    await waitFor(() => expect(holesIn(table)).toEqual(['perimeter', 'uedama']));
    const perimeter = within(holeRow('perimeter'));
    expect(perimeter.getByText('Perimeter')).toHaveClass('font-semibold');
    expect(perimeter.getByText('Capital')).toBeInTheDocument();
    expect(perimeter.getByText('AAA-111')).toBeInTheDocument();
    expect(perimeter.queryByText(/Q063/)).not.toBeInTheDocument();

    const group = within(dialog).getByRole('button', {
      name: '1 exit into J-space · no gate route from you',
    });
    expect(group).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(group);
    const jspace = await within(dialog).findByRole('table', { name: JSPACE_TABLE });
    expect(holesIn(jspace)).toEqual(['jspace']);
    expect(within(holeRow('jspace')).getByText('No gate route')).toBeInTheDocument();
    // J-space exits are not offered Use in route.
    expect(within(holeRow('jspace')).queryByRole('button')).not.toBeInTheDocument();
  });

  it('opens a row onto its type, both signatures and the exit on zKillboard', async () => {
    const dialog = await openFromBrowse();
    await within(dialog).findByRole('table', { name: MAIN_TABLE });
    fireEvent.click(holeRow('uedama'));
    expect(await screen.findByText('Type Q063')).toBeInTheDocument();
    expect(screen.getByText('enter at AAA-111 in Thera, leave at UED-001')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Uedama on zKillboard (opens in a new tab)' })
    ).toHaveAttribute('href', `https://zkillboard.com/system/${UEDAMA}/`);
  });

  it('Use in route pins the hole on the first leg, switches hole jumps on in the link and closes', async () => {
    const dialog = await openFromBrowse(`?from=${JITA}&pin=,gates`);
    await within(dialog).findByRole('table', { name: MAIN_TABLE });
    await userEvent.setup({ delay: null }).click(
      within(holeRow('uedama')).getByRole('button', {
        name: 'Use the Thera hole at Uedama in the route',
      })
    );

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Thera / Turnur' })).toBeNull()
    );
    const params = new URLSearchParams(window.location.search);
    expect(params.get('wh')).toBe('1');
    // The first leg is the hole; the second leg keeps its pin.
    expect(params.get('pin')).toBe('uedama,gates');
    expect(params.get('from')).toBe(String(JITA));
  });

  it('filters by hub, counting each hub under the other filters', async () => {
    const dialog = await openFromBrowse();
    const table = await within(dialog).findByRole('table', { name: MAIN_TABLE });
    await waitFor(() => expect(holesIn(table)).toEqual(['perimeter', 'uedama']));
    const hub = within(dialog).getByRole('group', { name: 'Hub' });
    expect(within(hub).getByRole('button', { name: 'Both 2' })).toBeInTheDocument();
    expect(within(hub).getByRole('button', { name: 'Turnur 1' })).toBeInTheDocument();

    await userEvent
      .setup({ delay: null })
      .click(within(hub).getByRole('button', { name: 'Thera 1' }));
    await waitFor(() =>
      expect(holesIn(screen.getByRole('table', { name: MAIN_TABLE }))).toEqual(['uedama'])
    );
    // Local to the modal: not in the page's URL.
    expect(window.location.search).not.toContain('hub=');
  });

  it('shows only the J-space exits under the J-space filter, with no group', async () => {
    const dialog = await openFromBrowse();
    await within(dialog).findByRole('table', { name: MAIN_TABLE });
    await userEvent
      .setup({ delay: null })
      .click(within(dialog).getByRole('combobox', { name: 'Exit' }));
    await userEvent
      .setup({ delay: null })
      .click(await screen.findByRole('option', { name: 'J-space' }));

    const table = await screen.findByRole('table', { name: JSPACE_TABLE });
    expect(holesIn(table)).toEqual(['jspace']);
    expect(screen.queryByRole('table', { name: MAIN_TABLE })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: JSPACE_GROUP })).not.toBeInTheDocument();
  });

  it('keeps only connections that pass at least the chosen ship size, and resets', async () => {
    const dialog = await openFromBrowse();
    await within(dialog).findByRole('table', { name: MAIN_TABLE });
    await userEvent
      .setup({ delay: null })
      .click(within(dialog).getByRole('combobox', { name: 'Fits' }));
    await userEvent
      .setup({ delay: null })
      .click(await screen.findByRole('option', { name: 'Cap' }));
    await waitFor(() =>
      expect(holesIn(screen.getByRole('table', { name: MAIN_TABLE }))).toEqual(['perimeter'])
    );

    await userEvent
      .setup({ delay: null })
      .click(within(dialog).getByRole('group', { name: 'Hub' }).querySelectorAll('button')[1]!);
    expect(await screen.findByText('No connections match these filters')).toBeInTheDocument();
    await userEvent
      .setup({ delay: null })
      .click(screen.getByRole('button', { name: 'Reset filters' }));
    expect(await screen.findByRole('table', { name: MAIN_TABLE })).toBeInTheDocument();
  });

  it('says an origin with no stargates reaches no exit by gate', async () => {
    await openFromBrowse(`?from=${THERA}`);
    expect(
      await screen.findByText('Thera has no stargates, so no exit can be reached by gate from it.')
    ).toBeInTheDocument();
  });

  it('says no K-space hole matches when only J-space exits are open', async () => {
    server.use(
      http.get(EVE_SCOUT_SIGNATURES_URL, () =>
        HttpResponse.json(SIGNATURES.filter((entry) => entry.id === 'jspace'))
      )
    );
    await openFromBrowse();
    expect(
      await screen.findByText('No holes into K-space match these filters')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: JSPACE_GROUP })).toBeInTheDocument();
  });

  it('says so when EVE-Scout lists nothing', async () => {
    server.use(http.get(EVE_SCOUT_SIGNATURES_URL, () => HttpResponse.json([])));
    await openFromBrowse();
    expect(
      await screen.findByText('EVE-Scout lists no open connections right now')
    ).toBeInTheDocument();
  });

  it('asks EVE-Scout again from the unavailable state without a reload', async () => {
    server.use(http.get(EVE_SCOUT_SIGNATURES_URL, () => new HttpResponse(null, { status: 503 })));
    await openFromBrowse();
    await screen.findByText(/Connections can.t be loaded right now/);

    server.use(http.get(EVE_SCOUT_SIGNATURES_URL, () => HttpResponse.json(SIGNATURES)));
    await userEvent.setup({ delay: null }).click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('table', { name: MAIN_TABLE })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('shows dense cards on a phone', async () => {
    const restoreViewport = stubViewport(PHONE_QUERY);
    try {
      const dialog = await openFromBrowse(`?from=${JITA}`, { phone: true });
      const table = await within(dialog).findByRole('table', { name: MAIN_TABLE });
      expect(table).toHaveClass('dt-stacked', 'dt-stack-dense');
      expect(within(holeRow('perimeter')).getByText(/→ PER-002/)).toBeInTheDocument();
    } finally {
      restoreViewport();
    }
  });
});
