import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { db } from '@/db';
import { stubViewport } from '@/test/viewport';
import { EVE_SCOUT_SIGNATURES_URL } from '@/lib/eveScout';
import { PHONE_QUERY } from '@/lib/useIsPhone';
import {
  CHAR_ID,
  ESI,
  signature,
  server,
  routeFact,
  visit,
  systemPickerInput,
  installTravelHarness,
} from '@/test/travelPage';
import {
  JITA,
  PERIMETER,
  UEDAMA,
  THERA,
  NIYABAINEN,
  MUVOLAILEN,
  SOBASEKI,
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

describe('Travel › Route Safety › Thera / Turnur holes', () => {
  /** Jita ─ Niyabainen ─ Muvolailen ─ Sobaseki ─ Uedama by gate; Thera has none. */
  const LONG_WAY = {
    [JITA]: [NIYABAINEN],
    [NIYABAINEN]: [JITA, MUVOLAILEN],
    [MUVOLAILEN]: [NIYABAINEN, SOBASEKI],
    [SOBASEKI]: [MUVOLAILEN, UEDAMA],
    [UEDAMA]: [SOBASEKI],
    [THERA]: [],
  };
  const HOLES = [
    signature({
      id: 'jita',
      in_system_id: JITA,
      in_system_name: 'Jita',
      in_signature: 'JIT-001',
      out_signature: 'THR-001',
    }),
    signature({
      id: 'uedama',
      in_system_id: UEDAMA,
      in_system_name: 'Uedama',
      in_signature: 'UED-002',
      out_signature: 'THR-002',
    }),
  ];

  beforeEach(() => {
    loadSolarSystemJumps.mockResolvedValue(LONG_WAY);
  });

  it('routes through the holes when that costs less, each a row of its own', async () => {
    server.use(http.get(EVE_SCOUT_SIGNATURES_URL, () => HttpResponse.json(HOLES)));
    visit(`?from=${JITA}&to=${UEDAMA}&wh=1`);

    expect(await screen.findAllByTestId('route-strip-hole')).toHaveLength(2);
    const table = await screen.findByRole('table', { name: 'Systems on the route' });
    const body = (await within(table).findAllByRole('row')).slice(1);
    const firstCells = body.map((row) => within(row).getAllByRole('cell')[0].textContent ?? '');
    expect(firstCells).toHaveLength(5);
    expect(firstCells[0]).toBe('Jita');
    expect(firstCells[1]).toContain('Warp to JIT-001 in Jita');
    expect(firstCells[1]).toContain('Q063');
    expect(firstCells[2]).toBe('Thera');
    expect(firstCells[3]).toContain('Warp to THR-002 in Thera');
    expect(firstCells[4]).toContain('Uedama');
    expect(within(body[2]).getByText('N/A')).toBeInTheDocument();
    expect(
      within(body[2]).getByRole('button', { name: "ESI doesn't report wormhole space" })
    ).toBeInTheDocument();
    expect(
      within(body[1]).getByRole('button', { name: 'Copy signature JIT-001 in Jita' })
    ).toBeInTheDocument();

    expect(routeFact('Jumps')).toBe('2');
    expect(routeFact('By gate')).toBe('0');
    expect(routeFact('Wormhole')).toBe('2');
    // Thera is counted as wormhole jumps, never as a nullsec system or the lowest security.
    expect(routeFact('High')).toBe('2');
    expect(routeFact('Null')).toBe('0');
    expect(routeFact('Lowest')).toBe('0.5');
    expect(screen.getAllByTestId('route-strip-cell')).toHaveLength(3);
  });

  it('sets in-game waypoints only up to the hole entrance', async () => {
    const user = userEvent.setup({ delay: null });
    loadSolarSystemJumps.mockResolvedValue({
      ...LONG_WAY,
      [PERIMETER]: [JITA],
      [JITA]: [PERIMETER, NIYABAINEN],
    });
    await db.tokens.update(CHAR_ID, {
      scopes: ['esi-location.read_location.v1', 'esi-ui.write_waypoint.v1'],
    });
    const sent: string[] = [];
    server.use(
      http.get(EVE_SCOUT_SIGNATURES_URL, () => HttpResponse.json(HOLES)),
      http.post(`${ESI}/ui/autopilot/waypoint`, ({ request }) => {
        sent.push(new URL(request.url).searchParams.get('destination_id') ?? '');
        return new HttpResponse(null, { status: 204 });
      })
    );
    visit(`?from=${PERIMETER}&to=${UEDAMA}&wh=1`);

    expect(await screen.findAllByTestId('route-strip-hole')).toHaveLength(2);
    const button = await screen.findByRole('button', { name: 'Set waypoints in game' });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);
    expect(
      await screen.findByText(
        /Waypoints set to Jita\. Take the wormhole there, then set the rest from Thera\./
      )
    ).toBeInTheDocument();
    expect(sent).toEqual([String(JITA)]);
  });

  it('skips holes the ship does not fit, and flies the gates', async () => {
    server.use(http.get(EVE_SCOUT_SIGNATURES_URL, () => HttpResponse.json(HOLES)));
    visit(`?from=${JITA}&to=${UEDAMA}&wh=1&whsize=large`);
    await waitFor(() =>
      expect(screen.queryByText('Checking Thera / Turnur connections…')).toBeNull()
    );

    const table = await screen.findByRole('table', { name: 'Systems on the route' });
    await waitFor(() =>
      expect(within(table).getAllByRole('row').slice(1)[0]).toHaveTextContent('Jita')
    );
    expect(screen.queryByTestId('route-strip-hole')).toBeNull();
    expect(routeFact('Jumps')).toBe('4');
  });

  it('never asks EVE-Scout with the switch off', async () => {
    const asked = vi.fn(() => HttpResponse.json(HOLES));
    server.use(http.get(EVE_SCOUT_SIGNATURES_URL, asked));
    visit(`?from=${JITA}&to=${UEDAMA}`);

    await screen.findByRole('table', { name: 'Systems on the route' });
    expect(routeFact('Jumps')).toBe('4');
    expect(asked).not.toHaveBeenCalled();
  });

  it('shows the gate route while the hole list loads, and says so', async () => {
    server.use(http.get(EVE_SCOUT_SIGNATURES_URL, () => new Promise<never>(() => {})));
    visit(`?from=${JITA}&to=${UEDAMA}&wh=1`);

    expect(await screen.findByText('Checking Thera / Turnur connections…')).toBeInTheDocument();
    expect(await screen.findByRole('table', { name: 'Systems on the route' })).toBeInTheDocument();
  });

  it('falls back to gates when EVE-Scout cannot be reached, and says so', async () => {
    server.use(http.get(EVE_SCOUT_SIGNATURES_URL, () => new HttpResponse(null, { status: 503 })));
    visit(`?from=${JITA}&to=${UEDAMA}&wh=1`);

    expect(
      await screen.findByText("EVE-Scout couldn't be reached, so this route uses gates only.")
    ).toBeInTheDocument();
    expect(routeFact('Jumps')).toBe('4');
  });

  describe('ways to fly a leg', () => {
    const pinInLink = () => new URLSearchParams(window.location.search).get('pin');
    const waysPanel = () => screen.findByRole('region', { name: 'Ways to fly leg 1' });

    beforeEach(() => {
      server.use(http.get(EVE_SCOUT_SIGNATURES_URL, () => HttpResponse.json(HOLES)));
    });

    it('shows no ways panel when gates are the only way', async () => {
      visit(`?from=${JITA}&to=${UEDAMA}`);

      await screen.findByRole('table', { name: 'Systems on the route' });
      expect(screen.queryByRole('region', { name: 'Ways to fly leg 1' })).toBeNull();
    });

    it('lists each way with its facts, the one in use first', async () => {
      visit(`?from=${JITA}&to=${UEDAMA}&wh=1`);

      const panel = await waysPanel();
      await within(panel).findByText('Via Thera');
      const [inUse, gates] = within(panel).getAllByRole('listitem');
      expect(inUse).toHaveTextContent(/^Via TheraIn use2 j/);
      expect(inUse).toHaveTextContent('Jita → Thera');
      expect(inUse).toHaveTextContent('Thera → Uedama');
      expect(inUse).toHaveTextContent('fits Medium');
      expect(gates).toHaveTextContent(/^Gates only4 j/);
      expect(gates).toHaveTextContent('lowest 0.5·0 lowsec·0 nullsec');
      expect(gates).toHaveTextContent('passes Uedama');
      expect(
        within(inUse).queryByRole('button', { name: /^Use .* for leg 1$/ })
      ).not.toBeInTheDocument();
    });

    it('pins a way into the link, and the leg flies it', async () => {
      const user = userEvent.setup({ delay: null });
      visit(`?from=${JITA}&to=${UEDAMA}&wh=1`);

      const panel = await waysPanel();
      await user.click(
        await within(panel).findByRole('button', { name: 'Use Gates only for leg 1' })
      );
      expect(pinInLink()).toBe('gates');
      await waitFor(() => expect(routeFact('Jumps')).toBe('4'));
      // The leg re-plans, so the panel is drawn afresh.
      await waitFor(async () =>
        expect(within(await waysPanel()).getAllByRole('listitem')[0]).toHaveTextContent(
          /^Gates onlyIn use/
        )
      );

      await user.click(
        within(await waysPanel()).getByRole('button', { name: 'Use Via Thera for leg 1' })
      );
      expect(pinInLink()).toBe('thera');
      await waitFor(() => expect(routeFact('Jumps')).toBe('2'));
    });

    it('previews an Avoid on a pinned leg as the leg is flown, pin and all', async () => {
      const user = userEvent.setup({ delay: null });
      visit(`?from=${JITA}&to=${UEDAMA}&wh=1&pin=gates`);

      await waitFor(() => expect(routeFact('Jumps')).toBe('4'));
      const table = await screen.findByRole('table', { name: 'Systems on the route' });
      await user.click(await within(table).findByRole('button', { name: /^3 systems/ }));
      await user.click(within(table).getByRole('button', { name: 'Avoid Muvolailen' }));
      const dialog = await screen.findByRole('dialog', { name: 'Avoid Muvolailen?' });

      // Gates only is pinned, and gates only has no way around Muvolailen: the
      // trip stays 4 jumps, never the unpinned hole route's 2.
      expect(
        await within(dialog).findByText(/^The route becomes 4 jumps \(\+0\)/)
      ).toBeInTheDocument();
      expect(within(dialog).getByText(/no way around Muvolailen/)).toBeInTheDocument();
    });

    it('says when a pinned hole has closed, and flies the planner’s pick', async () => {
      visit(`?from=${JITA}&to=${UEDAMA}&wh=1&pin=gone`);

      expect(
        await screen.findByText(
          "The pinned wormhole has closed or is no longer on EVE-Scout's list, so this leg flies the planner's pick."
        )
      ).toBeInTheDocument();
      expect(routeFact('Jumps')).toBe('2');
    });

    it('says when a pinned hub has no qualifying hole', async () => {
      visit(`?from=${JITA}&to=${UEDAMA}&wh=1&whhub=turnur&pin=thera`);

      expect(
        await screen.findByText(
          "No open Thera hole fits the hole settings, so this leg flies the planner's pick."
        )
      ).toBeInTheDocument();
      expect(routeFact('Jumps')).toBe('4');
    });

    it('says EVE-Scout could not be reached for a pinned hole, never that the switch is off', async () => {
      server.use(http.get(EVE_SCOUT_SIGNATURES_URL, () => new HttpResponse(null, { status: 503 })));
      visit(`?from=${JITA}&to=${UEDAMA}&wh=1&pin=uedama`);

      expect(
        await screen.findByText(
          "EVE-Scout couldn't be reached, so the pinned way can't be checked. This leg flies the planner's pick."
        )
      ).toBeInTheDocument();
      expect(screen.queryByText(/Route through Thera \/ Turnur is off/)).toBeNull();
    });

    it('opens a Route via link asking for a stop, then flies the pinned hole', async () => {
      const user = userEvent.setup({ delay: null });
      visit(`?from=${JITA}&wh=1&pin=uedama`);

      expect(
        await screen.findByText('Add a stop to fly there through the pinned wormhole.')
      ).toBeInTheDocument();
      // With no stops the destination is a field already on the page, not an Add stop button.
      await user.type(await systemPickerInput(), 'Ueda');
      await user.click(await screen.findByRole('option', { name: /Uedama/ }));

      expect(pinInLink()).toBe('uedama');
      await waitFor(async () =>
        expect(within(await waysPanel()).getAllByRole('listitem')[0]).toHaveTextContent(
          /^Pinned hole via TheraIn use2 j/
        )
      );
    });

    it('folds the ways under the leg on a phone', async () => {
      const restoreViewport = stubViewport(PHONE_QUERY);
      try {
        const user = userEvent.setup({ delay: null });
        visit(`?from=${JITA}&to=${UEDAMA}&wh=1`);

        const toggle = await screen.findByRole('button', { name: 'Compare ways to fly leg 1' });
        await waitFor(() => expect(toggle).toHaveTextContent('Gates only·4 jumpsCompare'));
        expect(screen.queryByRole('region', { name: 'Ways to fly leg 1' })).toBeNull();
        await user.click(toggle);
        expect(await waysPanel()).toBeInTheDocument();
      } finally {
        restoreViewport();
      }
    });
  });
});
