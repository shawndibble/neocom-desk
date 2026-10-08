import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { db } from '@/db';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
import { App } from '@/app/App';
import { formatTimestamp } from '@/lib/timestamp';

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}));

vi.mock('@/sde/loadSde', () => ({
  loadSkills: vi.fn(async () => []),
  loadTypes: vi.fn(async () => ({})),
  loadBlueprints: vi.fn(async () => ({})),
  loadMarketWideTrees: vi.fn(async () => ({})),
}));

const CHAR_ID = 91;
const ESI = 'https://esi.evetech.net';

const clonesPayload = {
  home_location: { location_id: 60003760, location_type: 'station' as const },
  last_station_change_date: '2025-06-01T00:00:00Z',
  jump_clones: [
    {
      jump_clone_id: 1,
      location_id: 60003760,
      location_type: 'station' as const,
      implants: [19540],
    },
    {
      jump_clone_id: 2,
      location_id: 1000000000002,
      location_type: 'structure' as const,
      implants: [],
    },
  ],
  // Just jumped: with Infomorph Synchronizing III (21h cooldown), always on cooldown.
  last_clone_jump_date: new Date().toISOString(),
};

const skillsPayload = {
  skills: [
    {
      skill_id: 33399,
      trained_skill_level: 3,
      active_skill_level: 3,
      skillpoints_in_skill: 135_765,
    },
  ],
  total_sp: 135_765,
  unallocated_sp: 0,
};

const server = setupServer(
  http.get(`${ESI}/characters/${CHAR_ID}/clones`, () => HttpResponse.json(clonesPayload)),
  http.get(`${ESI}/characters/${CHAR_ID}/skills`, () => HttpResponse.json(skillsPayload)),
  http.get(`${ESI}/characters/${CHAR_ID}/location`, () =>
    HttpResponse.json({ solar_system_id: 30000142 })
  ),
  http.get(`${ESI}/characters/${CHAR_ID}/implants`, () => HttpResponse.json([19541])),
  http.get(`${ESI}/universe/systems/30000142`, () =>
    HttpResponse.json({ system_id: 30000142, name: 'Jita', security_status: 0.9459 })
  ),
  // Only the worn implant has a price; the jump clone's implant has none.
  http.get('https://market.fuzzwork.co.uk/aggregates/', ({ request }) => {
    const types = new URL(request.url).searchParams.get('types')?.split(',') ?? [];
    const body: Record<string, unknown> = {};
    for (const id of types) {
      body[id] =
        id === '19541'
          ? { sell: { min: '2500000', volume: '1', orderCount: '1' } }
          : { sell: { orderCount: '0' } };
    }
    return HttpResponse.json(body);
  }),
  http.get(`${ESI}/characters/${CHAR_ID}/skillqueue`, () => HttpResponse.json([])),
  http.get(`${ESI}/universe/stations/60003760`, () =>
    HttpResponse.json({
      station_id: 60003760,
      name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant',
      type_id: 1531,
      system_id: 30000142,
    })
  ),
  http.get(`${ESI}/universe/structures/1000000000002`, () =>
    HttpResponse.json({ error: 'Forbidden' }, { status: 403 })
  ),
  http.get(`${ESI}/characters/${CHAR_ID}`, () =>
    HttpResponse.json({
      name: 'Pilot One',
      corporation_id: 1001,
      alliance_id: 2001,
      birthday: '2015-01-01T00:00:00Z',
      bloodline_id: 1,
      gender: 'female',
      race_id: 1,
    })
  ),
  http.get(`${ESI}/corporations/1001`, () =>
    HttpResponse.json({
      name: 'Test Corp',
      ticker: 'TC',
      ceo_id: 1,
      creator_id: 1,
      member_count: 5,
      tax_rate: 0.1,
    })
  ),
  http.get(`${ESI}/alliances/2001`, () =>
    HttpResponse.json({
      name: 'Test Alliance',
      ticker: 'TA',
      creator_corporation_id: 1,
      creator_id: 1,
      date_founded: '2016-01-01T00:00:00Z',
    })
  ),
  http.get(`${ESI}/universe/types/19540`, () =>
    HttpResponse.json({
      type_id: 19540,
      name: 'High-grade Ascendancy Alpha',
      description: '+4 <b>Willpower</b> bonus',
      group_id: 300,
      published: true,
    })
  ),
  http.get(`${ESI}/universe/types/19541`, () =>
    HttpResponse.json({
      type_id: 19541,
      name: 'Worn Implant',
      description: '',
      group_id: 300,
      published: true,
    })
  ),
  http.post(`${ESI}/universe/names`, () =>
    HttpResponse.json([
      { id: 19540, name: 'High-grade Ascendancy Alpha', category: 'inventory_type' },
      { id: 19541, name: 'Worn Implant', category: 'inventory_type' },
    ])
  )
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());
beforeEach(async () => {
  await db.characters.clear();
  await db.tokens.clear();
  await db.settings.clear();
  await db.esiCache.clear();
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
  usePublicInfo.setState({ byCharacterId: {} });

  await db.characters.put({ characterId: CHAR_ID, name: 'Pilot One', ownerHash: 'oh', addedAt: 1 });
  await db.tokens.put({
    characterId: CHAR_ID,
    accessToken: 'access-token',
    refreshToken: 'refresh',
    expiresAt: Date.now() + 3_600_000,
    scopes: ['esi-clones.read_clones.v1', 'esi-skills.read_skills.v1'],
  });
  await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: CHAR_ID });
  window.history.pushState({}, '', '/clones');
});

describe('Clones', () => {
  it('lists jump clones with resolved location and implant names, and the cooldown', async () => {
    render(<App />);
    expect(
      await screen.findAllByText('Jita IV - Moon 4 - Caldari Navy Assembly Plant')
    ).not.toHaveLength(0);
    expect(screen.getByText('High-grade Ascendancy Alpha')).toBeInTheDocument();
    expect(screen.getByText('No implants')).toBeInTheDocument();
    expect(screen.getByText(/Until/)).toBeInTheDocument();
  });

  it('links each implant name to its Show info, unlike the plain-text empty state', async () => {
    render(<App />);
    expect(
      await screen.findByRole('link', { name: 'High-grade Ascendancy Alpha' })
    ).toHaveAttribute('href', '/clones?info=type-19540');
    expect(screen.getByText('No implants')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'No implants' })).not.toBeInTheDocument();
  });

  it('shows an implant description tooltip on hover, still linking to Show info', async () => {
    render(<App />);
    const link = await screen.findByRole('link', { name: 'High-grade Ascendancy Alpha' });
    fireEvent.pointerMove(link);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('+4 Willpower bonus');
    expect(link).toHaveAttribute('href', '/clones?info=type-19540');
  });

  it('surfaces the home station and last jump-clone-change date', async () => {
    render(<App />);
    await screen.findByText('High-grade Ascendancy Alpha');
    // Home station shares its id with a jump clone, so its name resolves
    // from the same batch — appearing once in the home-location line and
    // again in the jump-clone table row.
    expect(
      screen.getAllByText('Jita IV - Moon 4 - Caldari Navy Assembly Plant').length
    ).toBeGreaterThan(1);
    expect(
      screen.getByText(formatTimestamp(new Date('2025-06-01T00:00:00Z')), { exact: false })
    ).toBeInTheDocument();
  });

  it('leaves implants on "Type #id" rather than fanning out when the names batch is rate-limited', async () => {
    // A large jump-clone implant batch is more likely to hit ESI's error-limit
    // throttling than a small one — and a throttle is exactly when the per-id
    // fallback must NOT fire (issue #655 item D). ESI's error limit is 100
    // non-2xx responses per minute counted globally across every route, so
    // answering one throttled batch with one GET /universe/types/{id} per
    // implant would deepen the outage for every other panel in the app.
    // Degrading to the placeholder until something asks again is the trade.
    // The one type request below is the tooltip description lookup (#1379), one
    // per distinct implant — it is not a name fallback, and the name stays a
    // placeholder even though that response carries one.
    let typeRequests = 0;
    server.use(
      http.post(
        `${ESI}/universe/names`,
        // retry-after: 0 so esiFetch's one blind retry doesn't idle the test.
        () => new HttpResponse(null, { status: 429, headers: { 'retry-after': '0' } })
      ),
      http.get(`${ESI}/universe/types/19540`, () => {
        typeRequests += 1;
        return HttpResponse.json({
          type_id: 19540,
          name: 'High-grade Ascendancy Alpha',
          description: '',
          group_id: 300,
          published: true,
        });
      })
    );

    render(<App />);

    expect(await screen.findByText('Type #19540')).toBeInTheDocument();
    expect(screen.getByText('Type #19541')).toBeInTheDocument();
    expect(screen.queryByText('High-grade Ascendancy Alpha')).not.toBeInTheDocument();
    expect(typeRequests).toBe(1);
  });

  it('renders a clone in an inaccessible structure as an id fallback, without a re-auth banner', async () => {
    render(<App />);
    await screen.findAllByText('Jita IV - Moon 4 - Caldari Navy Assembly Plant');
    expect(screen.getByText('Structure #1000000000002')).toBeInTheDocument();
    expect(screen.queryByText('Log in again to see your clones')).not.toBeInTheDocument();
  });

  it('shows a jump clone name beside its location, trimmed, and "Unnamed" for a blank name', async () => {
    const station = { location_id: 60003760, location_type: 'station' as const, implants: [] };
    server.use(
      http.get(`${ESI}/characters/${CHAR_ID}/clones`, () =>
        HttpResponse.json({
          jump_clones: [
            { ...station, jump_clone_id: 1, name: '  Alpha  ' },
            { ...station, jump_clone_id: 2, name: 'Beta' },
            { ...station, jump_clone_id: 3, name: '   ' },
            { ...station, jump_clone_id: 4 },
          ],
        })
      )
    );
    render(<App />);
    const alpha = await screen.findByText('Alpha');
    expect(alpha.closest('li')).toHaveTextContent(/^Alpha\s*Jita IV - Moon 4 - Caldari Navy/);
    expect(screen.getByText('Beta')).toBeInTheDocument();
    const rows = screen
      .getAllByText('Jita IV - Moon 4 - Caldari Navy Assembly Plant')
      .map((el) => el.closest('li'))
      .filter((li) => li !== null);
    const unnamed = rows.filter((li) => !/Alpha|Beta/.test(li.textContent ?? ''));
    expect(unnamed).toHaveLength(2);
    for (const li of unnamed) {
      expect(li).toHaveTextContent(/^Unnamed\s*Jita IV - Moon 4 - Caldari Navy/);
    }
  });

  it('shows the empty state when there are no clones', async () => {
    server.use(
      http.get(`${ESI}/characters/${CHAR_ID}/clones`, () => HttpResponse.json({ jump_clones: [] }))
    );
    render(<App />);
    expect(await screen.findByText('No jump clones')).toBeInTheDocument();
  });

  it('carries the same character header the Overview tab shows, not a page title', async () => {
    render(<App />);

    // Identity, corp/alliance and SP: identical to /overview, so nothing above
    // the tabs moves as you switch between them.
    expect(await screen.findByRole('heading', { level: 1, name: 'Pilot One' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Test Corp' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Test Alliance' })).toBeInTheDocument();
    expect(await screen.findByText('135,765')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: 'Clones' })).not.toBeInTheDocument();
  });

  it("keeps this view's data age and Refresh below the tabs, not in the shared header", async () => {
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: 'Pilot One' });

    const refresh = screen.getByRole('button', { name: 'Refresh' });
    const header = screen.getByRole('heading', { level: 1, name: 'Pilot One' }).closest('header');
    expect(header?.contains(refresh)).toBe(false);
    expect(await screen.findByText('just now')).toBeInTheDocument();
  });

  it('offers Refresh even when there is nothing to show', async () => {
    // The empty and failed states are the ones a Refresh exists for, so the
    // panel's toolbar has to outlive its rows.
    server.use(
      http.get(`${ESI}/characters/${CHAR_ID}/clones`, () => HttpResponse.json({ jump_clones: [] }))
    );
    render(<App />);
    await screen.findByText('No jump clones');

    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
  });

  it('shows a re-login prompt when the clones scope itself was revoked', async () => {
    server.use(
      http.get(`${ESI}/characters/${CHAR_ID}/clones`, () =>
        HttpResponse.json({ error: 'missing scope' }, { status: 403 })
      )
    );
    render(<App />);
    expect(await screen.findByText('Log in again to see your clones')).toBeInTheDocument();
  });

  it('shows jumps away on the home clone and each clone, the count opening the route to that station', async () => {
    render(<App />);
    // The Character is in Jita's system, the home and first clone's station: 0 jumps.
    const counts = await screen.findAllByRole('button', { name: '0 jumps' });
    expect(counts).toHaveLength(2);
    // The structure is outside the ACL: no system, so the existing unknown text.
    expect(screen.getByText('-')).toBeInTheDocument();
    fireEvent.click(counts[1]);
    await waitFor(() => expect(window.location.pathname).not.toBe('/clones'));
    expect(window.location.search).toContain('30000142');
  });

  it('shows the unknown text when the Character location is unavailable', async () => {
    server.use(
      http.get(`${ESI}/characters/${CHAR_ID}/location`, () =>
        HttpResponse.json({ error: 'missing scope' }, { status: 403 })
      )
    );
    render(<App />);
    await screen.findByText('High-grade Ascendancy Alpha');
    await waitFor(() => expect(screen.getAllByText('-').length).toBeGreaterThanOrEqual(3));
    expect(screen.queryByRole('button', { name: /jump/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Log in again to see your clones')).not.toBeInTheDocument();
  });

  it('reads an unnamed clone as a dimmed "Unnamed"', async () => {
    render(<App />);
    const unnamed = await screen.findAllByText('Unnamed');
    expect(unnamed).toHaveLength(2);
    expect(unnamed[0]).toHaveClass('text-text-dim');
  });

  it('loads and caches the worn clone implants and the training queue', async () => {
    await db.tokens.update(CHAR_ID, {
      scopes: [
        'esi-clones.read_clones.v1',
        'esi-skills.read_skills.v1',
        'esi-skills.read_skillqueue.v1',
      ],
    });
    render(<App />);
    await screen.findByText('High-grade Ascendancy Alpha');
    await waitFor(async () => {
      expect((await db.esiCache.get([CHAR_ID, 'implants']))?.value).toEqual([19541]);
      expect(await db.esiCache.get([CHAR_ID, 'skillqueue'])).toBeDefined();
    });
  });

  it('falls back to the cached worn implants offline, with no re-login prompt', async () => {
    await db.esiCache.put({ characterId: CHAR_ID, key: 'implants', value: [19540], fetchedAt: 1 });
    server.use(http.get(`${ESI}/characters/${CHAR_ID}/implants`, () => HttpResponse.error()));
    render(<App />);
    expect(await screen.findAllByText('High-grade Ascendancy Alpha')).toHaveLength(2);
    expect(
      screen.queryByText('Log in again to see the implants you are wearing')
    ).not.toBeInTheDocument();
  });

  it('states the jump cooldown once, as shared by every clone', async () => {
    render(<App />);
    expect(await screen.findByText(/Until/)).toBeInTheDocument();
    expect(screen.getAllByText(/shared by every clone/)).toHaveLength(1);
    expect(screen.getAllByRole('progressbar')).toHaveLength(1);
    expect(screen.queryByText('Jump Cooldown')).not.toBeInTheDocument();
    expect(screen.getByText(/Infomorph Synchronizing: -3 h/)).toBeInTheDocument();
  });

  it('renders no cooldown footnote when there is no last jump and no reduction', async () => {
    server.use(
      http.get(`${ESI}/characters/${CHAR_ID}/clones`, () =>
        HttpResponse.json({ ...clonesPayload, last_clone_jump_date: undefined })
      ),
      http.get(`${ESI}/characters/${CHAR_ID}/skills`, () =>
        HttpResponse.json({ skills: [], total_sp: 0 })
      )
    );
    render(<App />);
    expect(await screen.findByText('Ready')).toBeInTheDocument();
    expect(screen.queryByText(/Last jump/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Infomorph Synchronizing/)).not.toBeInTheDocument();
    const section = screen.getByRole('region', { name: 'Jump Cooldown' });
    expect(section.querySelector('p.text-xs')).toBeNull();
  });

  it('lists the clone being worn first, its implants linking to Show info, with count and value', async () => {
    render(<App />);
    const worn = await screen.findByRole('link', { name: 'Worn Implant' });
    expect(worn).toHaveAttribute('href', '/clones?info=type-19541');
    const row = worn.closest('li')?.parentElement?.closest('li') ?? null;
    expect(row).toHaveTextContent('Wearing now');
    expect(row).toHaveTextContent('Jita');
    expect(row).toHaveTextContent('1 implant');
    expect(await screen.findAllByText(/at risk if podded/)).toHaveLength(1);
    await waitFor(() => expect(row).toHaveTextContent(/2\.5M/));
    // The jump clone's implant has no price: said, not counted as free.
    const clone = screen
      .getByRole('link', { name: 'High-grade Ascendancy Alpha' })
      .closest('li')
      ?.parentElement?.closest('li');
    await waitFor(() => expect(clone).toHaveTextContent('1 unpriced'));
  });

  it('prompts a re-login for a missing read-implants grant without hiding the clones table', async () => {
    server.use(
      http.get(`${ESI}/characters/${CHAR_ID}/implants`, () =>
        HttpResponse.json({ error: 'missing scope' }, { status: 403 })
      )
    );
    render(<App />);
    expect(
      await screen.findByText('Log in again to see the implants you are wearing')
    ).toBeInTheDocument();
    expect(screen.getByText('High-grade Ascendancy Alpha')).toBeInTheDocument();
    expect(screen.queryByText('Log in again to see your clones')).not.toBeInTheDocument();
  });
});
