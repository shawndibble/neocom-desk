import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { db } from '@/db';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
import { App } from '@/app/App';
import { selectActiveEntryFromSorted, sortQueueEntries, selectQueueDepth } from './overviewQueue';
import type { SkillType } from '@/sde/types';
import { PHONE_QUERY } from '@/lib/useIsPhone';

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}));

const FIXTURE_SKILLS: SkillType[] = [
  {
    typeID: 3300,
    name: 'Gunnery',
    description: '',
    groupID: 10,
    groupName: 'Gunnery',
    rank: 1,
    primaryAttr: 'perception',
    secondaryAttr: 'willpower',
    prereqs: [],
  },
];

vi.mock('@/sde/loadMarketSde', () => ({
  loadNpcStations: vi.fn(async () => []),
  loadMarketGroups: vi.fn(async () => []),
  loadMarketTypes: vi.fn(async () => []),
  loadSolarSystems: vi.fn(async () => []),
  loadMarketRegions: vi.fn(async () => []),
  loadGlobalMarkets: vi.fn(async () => []),
  loadVariations: vi.fn(async () => ({ types: {}, metaGroups: {} })),
}));

vi.mock('@/sde/loadSde', () => ({
  loadSkills: vi.fn(async () => FIXTURE_SKILLS),
  loadTypes: vi.fn(async () => ({})),
  loadBlueprints: vi.fn(async () => ({})),
}));

const CHAR_ID = 91;
let lastAuthHeader: string | null = null;

const skillsPayload = {
  skills: [
    { skill_id: 3300, trained_skill_level: 4, active_skill_level: 4, skillpoints_in_skill: 90000 },
  ],
  total_sp: 5_000_000,
  unallocated_sp: 12_000,
};

// Relative to the instant the suite runs, not a fixed pair of calendar dates:
// Overview.tsx feeds this into selectActiveEntryFromSorted(..., Date.now()), so a
// hardcoded past/future pair eventually falls out of that window and this
// entry silently stops being "active" — see the BUG #10 postmortem below for
// why that failure mode is exactly the one this file is guarding against.
const queuePayload = [
  {
    skill_id: 3300,
    queue_position: 0,
    finished_level: 5,
    start_date: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    finish_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

const server = setupServer(
  http.get('https://esi.evetech.net/characters/:id/wallet', ({ request }) => {
    lastAuthHeader = request.headers.get('authorization');
    return HttpResponse.json(1234567.89);
  }),
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/skills`, () =>
    HttpResponse.json(skillsPayload)
  ),
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/skillqueue`, () =>
    HttpResponse.json(queuePayload)
  ),
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}`, () =>
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
  http.get('https://esi.evetech.net/corporations/1001', () =>
    HttpResponse.json({
      name: 'Test Corp',
      ticker: 'TC',
      ceo_id: 1,
      creator_id: 1,
      member_count: 5,
      tax_rate: 0.1,
    })
  ),
  http.get('https://esi.evetech.net/alliances/2001', () =>
    HttpResponse.json({
      name: 'Test Alliance',
      ticker: 'TA',
      creator_corporation_id: 1,
      creator_id: 1,
      date_founded: '2016-01-01T00:00:00Z',
    })
  ),
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/industry/jobs`, () =>
    HttpResponse.json([])
  ),
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/contracts`, () => HttpResponse.json([])),
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/planets`, () => HttpResponse.json([])),
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/planets/:planetId`, () =>
    HttpResponse.json({ links: [], pins: [], routes: [] })
  ),
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/mining/`, () => HttpResponse.json([])),
  // Fuzzwork, not ESI: the Open Orders card asks it what rivals charge. An
  // empty book means nothing beats anything, which is the quiet-board default.
  http.get('https://market.fuzzwork.co.uk/aggregates/', () => HttpResponse.json({})),
  // Public name lookups the board makes for its own row labels.
  http.get('https://esi.evetech.net/universe/planets/:planetId', ({ params }) =>
    HttpResponse.json({
      name: `Gehi ${params.planetId}`,
      planet_id: 1,
      system_id: 30000142,
      type_id: 11,
    })
  ),
  http.get('https://esi.evetech.net/universe/types/:typeId', () =>
    HttpResponse.json({ type_id: 3300, name: 'Gunnery', group_id: 10, published: true })
  ),
  http.post('https://esi.evetech.net/universe/names', () => HttpResponse.json([])),
  // An order's cost basis is read out of the character's own transaction
  // history; both are empty here, which is what "no cost basis known" means.
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/wallet/transactions`, () =>
    HttpResponse.json([])
  ),
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/wallet/journal`, () =>
    HttpResponse.json([])
  ),
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/orders/history`, () =>
    HttpResponse.json([])
  ),
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/orders`, () => HttpResponse.json([]))
);

/** One open sell order; only `type_id`/`order_id` matter to the tile's count. */
const OPEN_ORDER = {
  order_id: 1,
  type_id: 3300,
  region_id: 10000002,
  location_id: 60003760,
  range: 'station',
  price: 100,
  volume_total: 10,
  volume_remain: 10,
  duration: 90,
  issued: '2026-08-01T00:00:00Z',
  is_corporation: false,
};

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());
beforeEach(async () => {
  lastAuthHeader = null;
  await db.characters.clear();
  await db.tokens.clear();
  await db.settings.clear();
  await db.esiCache.clear();
  await db.notificationFeed.clear();
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
  usePublicInfo.setState({ byCharacterId: {} });

  await db.characters.put({ characterId: CHAR_ID, name: 'Pilot One', ownerHash: 'oh', addedAt: 1 });
  await db.tokens.put({
    characterId: CHAR_ID,
    accessToken: 'access-token-91',
    refreshToken: 'refresh-91',
    expiresAt: Date.now() + 3_600_000,
    scopes: ['esi-wallet.read_character_wallet.v1'],
  });
  await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: CHAR_ID });
  window.history.pushState({}, '', '/overview');
});

/**
 * Fixtures are always relative to the wall clock, never a calendar date.
 *
 * The board is entirely countdowns — batch expiries, job end dates, the
 * deadline hero, every `formatDuration` — and this file already learned once
 * (BUG #10, below) that a hardcoded past/future pair silently drifts out of
 * the window it was written for and stops testing anything.
 */
function hoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * 3_600_000).toISOString();
}

const ORDERS_SCOPE = 'esi-markets.read_character_orders.v1';
const PLANETS_SCOPE = 'esi-planets.manage_planets.v1';
const INDUSTRY_SCOPE = 'esi-industry.read_character_jobs.v1';

/**
 * Adds scopes to the seeded token.
 *
 * Several of the board's loaders check the scope up front and skip the
 * Character entirely rather than taking a live 403 — so a card stays
 * deliberately empty until its scope is granted, and a test that wants rows
 * has to say which grant it is testing under.
 */
async function grantScopes(scopes: readonly string[]): Promise<void> {
  const token = await db.tokens.get(CHAR_ID);
  await db.tokens.put({ ...token!, scopes: [...(token?.scopes ?? []), ...scopes] });
}

/** A card by its panel heading — the `<section>` around it, for scoped queries. */
async function findCard(title: RegExp): Promise<HTMLElement> {
  const heading = await screen.findByRole('heading', { name: title });
  return heading.closest('section') as HTMLElement;
}

function industryJob({ jobId, endsInHours }: { jobId: number; endsInHours: number }) {
  return {
    job_id: jobId,
    activity_id: 1,
    blueprint_type_id: 3300,
    product_type_id: 3300,
    facility_id: 60003760,
    station_id: 60003760,
    runs: 2,
    start_date: hoursFromNow(endsInHours - 24),
    end_date: hoursFromNow(endsInHours),
    status: 'active' as const,
  };
}

/**
 * Four colonies whose extractors all expire three hours out, give or take the
 * minutes it took to walk the list in-client — which is exactly the shape
 * `groupColoniesIntoBatches` exists to fold into one row.
 */
const COLONIES = [0, 0.1, 0.2, 0.3].map((offset, i) => ({
  planet: {
    planet_id: 4001 + i,
    solar_system_id: 30000142,
    planet_type: 'barren' as const,
    owner_id: CHAR_ID,
    upgrade_level: 5,
    num_pins: 1,
    last_update: hoursFromNow(-1),
  },
  detail: {
    links: [],
    routes: [],
    pins: [
      {
        pin_id: 5001 + i,
        type_id: 2848,
        latitude: 0,
        longitude: 0,
        install_time: hoursFromNow(-21),
        expiry_time: hoursFromNow(3 + offset),
        extractor_details: { heads: [], cycle_time: 3600, qty_per_cycle: 1000 },
      },
    ],
  },
}));

function feedEntry({
  id,
  eventId,
  title,
  eveType,
  firedAt = Date.now(),
}: {
  id: string;
  eventId: string;
  title: string;
  eveType?: string;
  firedAt?: number;
}) {
  return { id, characterId: CHAR_ID, eventId, title, body: `${title} body`, firedAt, eveType };
}

async function seedFeed(entries: ReturnType<typeof feedEntry>[]): Promise<void> {
  await db.notificationFeed.bulkPut(entries);
}

describe('Overview board', () => {
  it('shows the active character, the wallet and what is training', async () => {
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Pilot One' })).toBeInTheDocument();
    expect(await screen.findByText(/1,234,567\.89/)).toBeInTheDocument();
    expect(await screen.findByText('Gunnery')).toBeInTheDocument();
    expect(screen.getAllByText('just now').length).toBeGreaterThan(0);
    expect(lastAuthHeader).toBe('Bearer access-token-91');
  });

  it('shows corp/alliance and total/unallocated SP in the shared header', async () => {
    render(<App />);
    expect(await screen.findByText(/Test Corp/)).toBeInTheDocument();
    expect(screen.getByText(/Test Alliance/)).toBeInTheDocument();
    expect(screen.getByText('5,000,000')).toBeInTheDocument();
    expect(screen.getByText('12,000')).toBeInTheDocument();
  });

  it('adds SP the queue finished to the total, which /skills has not counted', async () => {
    // ESI's total_sp comes from the same payload as the per-skill rows and
    // goes stale with them until the character next logs in.
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/skillqueue`, () =>
        HttpResponse.json([
          {
            skill_id: 3300,
            queue_position: 0,
            finished_level: 5,
            start_date: hoursFromNow(-72),
            finish_date: hoursFromNow(-24),
            level_end_sp: 512_000,
          },
        ])
      )
    );
    render(<App />);

    expect(await screen.findByText('5,422,000')).toBeInTheDocument(); // + (512,000 - 90,000)
    expect(screen.queryByText('5,000,000')).not.toBeInTheDocument();
  });

  /*
   * The premise of the whole redesign. The board is opened on the days when
   * everything has gone wrong at once, so the failure that matters is not a
   * wrong number — it is a card that grows without bound and pushes every
   * other domain off the page.
   */
  it('renders 137 undercut orders as one number, not 137 rows', async () => {
    await grantScopes([ORDERS_SCOPE]);
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/orders`, () =>
        HttpResponse.json(
          Array.from({ length: 137 }, (_, i) => ({ ...OPEN_ORDER, order_id: i + 1 }))
        )
      ),
      // Every one of them beaten at its own station.
      http.get('https://market.fuzzwork.co.uk/aggregates/', () =>
        HttpResponse.json({
          // `orderCount` is load-bearing: `fuzzwork.ts` reads a side without
          // one as having no orders at all, so a price alone means nothing.
          '3300': {
            buy: { max: '0', volume: '0', orderCount: '0' },
            sell: { min: '50', volume: '10', orderCount: '3' },
          },
        })
      )
    );
    render(<App />);

    const card = await findCard(/open orders/i);
    expect(await within(card).findByText('137')).toBeInTheDocument();
    // Three tiles and no per-order rows, whatever the count.
    expect(within(card).queryAllByRole('listitem')).toHaveLength(0);
  });

  /*
   * A tile is a count of this Character's orders; the Orders page is every
   * Character's. Opening the unfiltered page from a tile reading "3 undercut"
   * would put that 3 next to a list of thirty, so the link carries both what
   * was counted and whose it was.
   */
  it('opens each count on the Orders page narrowed to exactly what it counted', async () => {
    await grantScopes([ORDERS_SCOPE]);
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/orders`, () =>
        HttpResponse.json(Array.from({ length: 3 }, (_, i) => ({ ...OPEN_ORDER, order_id: i + 1 })))
      ),
      http.get('https://market.fuzzwork.co.uk/aggregates/', () =>
        HttpResponse.json({
          '3300': {
            buy: { max: '0', volume: '0', orderCount: '0' },
            sell: { min: '50', volume: '10', orderCount: '3' },
          },
        })
      )
    );
    render(<App />);

    const card = await findCard(/open orders/i);
    // All three undercut scopes, because the tile sums all three — an order
    // carries at most one, so the filter matches the same orders it counted.
    expect(await within(card).findByRole('link', { name: /undercut/i })).toHaveAttribute(
      'href',
      `/market?section=orders&problem=undercutStation&problem=undercutSystem&problem=undercutRegion&character=${CHAR_ID}`
    );
    // The header's own link stays the whole page, the way every other card's does.
    expect(within(card).getByRole('link', { name: /open/i })).toHaveAttribute(
      'href',
      '/market?section=orders'
    );
  });

  it('leaves a zero unlinked — there is nothing behind it to open', async () => {
    render(<App />);
    const card = await findCard(/open orders/i);
    await within(card).findByText('Undercut');

    expect(within(card).queryByRole('link', { name: /undercut/i })).toBeNull();
  });

  /*
   * Asked for twice, in the review of the mockups: amber says "look here", and
   * a zero has nothing to look at. A toned zero sends you to a page where
   * there is nothing to do, which is the opposite of what this board is for.
   */
  it('draws a zero as plain text, with neither the warning tone nor its glyph', async () => {
    render(<App />);
    const card = await findCard(/open orders/i);
    const undercut = within(card).getByText('Undercut').closest('span')?.parentElement;
    const zero = within(undercut as HTMLElement).getByText('0');

    expect(zero.className).not.toMatch(/text-warning/);
    expect(zero.className).toMatch(/text-text/);
    // The severity glyph is dropped too — colour is never the only signal, so
    // leaving the shape behind would still say "look here" (DESIGN.md §7).
    expect((undercut as HTMLElement).querySelector('svg')).toBeNull();
  });

  /*
   * `colonyBatches.test.ts` covers the grouping itself; this covers that the
   * card renders batches rather than colonies. PI is done in one sitting, so
   * four planets on one timer is one trip, and four rows saying "3h" would be
   * four times the reading for it.
   */
  it('folds four colonies sharing a timer into one reset run', async () => {
    await grantScopes([PLANETS_SCOPE]);
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/planets`, () =>
        HttpResponse.json(COLONIES.map((c) => c.planet))
      ),
      ...COLONIES.map((c) =>
        http.get(
          `https://esi.evetech.net/characters/${CHAR_ID}/planets/${c.planet.planet_id}`,
          () => HttpResponse.json(c.detail)
        )
      )
    );
    render(<App />);

    const card = await findCard(/planetary industry/i);
    expect(await within(card).findByText(/4 colonies end together/i)).toBeInTheDocument();
    expect(within(card).getAllByRole('listitem')).toHaveLength(1);
  });

  it('leads with the soonest deadline on the board and links to the card that owns it', async () => {
    await grantScopes([PLANETS_SCOPE, INDUSTRY_SCOPE]);
    server.use(
      // A colony batch three hours out, against a job two days out and a skill
      // thirty days out — the colony has to win, and clicking it has to land
      // on Planetary rather than on whichever card happened to be checked first.
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/planets`, () =>
        HttpResponse.json(COLONIES.map((c) => c.planet))
      ),
      ...COLONIES.map((c) =>
        http.get(
          `https://esi.evetech.net/characters/${CHAR_ID}/planets/${c.planet.planet_id}`,
          () => HttpResponse.json(c.detail)
        )
      ),
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/industry/jobs`, () =>
        HttpResponse.json([industryJob({ jobId: 7, endsInHours: 48 })])
      )
    );
    render(<App />);

    const hero = await screen.findByText('Next deadline');
    const cell = hero.parentElement as HTMLElement;

    /*
     * Waited on rather than read once: the six cards load independently, so
     * the hero legitimately shows the skill queue's thirty days for a tick
     * before the colony read lands and takes the lead. Asserting on the first
     * render would be asserting on load order.
     */
    await waitFor(() => {
      expect(within(cell).getByRole('link')).toHaveAttribute('href', '/planetary-industry');
    });
    // The note, not the countdown: the fixture is three hours from the instant
    // it was built and the clock has moved on by the time this renders, so an
    // exact "3h" would be a flake waiting for a slow CI box.
    const link = within(cell).getByRole('link');
    expect(within(link).getByText('4 colonies end together')).toBeInTheDocument();
    expect(within(link).getByText(/^2h 5\dm$/)).toBeInTheDocument();
  });

  /*
   * "A card that disappears when there is nothing wrong is a card you cannot
   * tell from a card that failed to load." Every domain has to be present on a
   * character that has never done any of it.
   */
  it('renders every card on a character with nothing going on', async () => {
    render(<App />);
    await screen.findByText(/1,234,567\.89/);

    for (const title of [
      /open orders/i,
      /mining tax/i,
      /planetary industry/i,
      /industry jobs/i,
      /^alerts$/i,
    ]) {
      expect(await findCard(title)).toBeInTheDocument();
    }
  });

  it('gives each card a link to the page that fixes it', async () => {
    render(<App />);
    await screen.findByText(/1,234,567\.89/);

    const destinations: [RegExp, string][] = [
      [/open orders/i, '/market?section=orders'],
      [/mining tax/i, '/moon-mining'],
      [/planetary industry/i, '/planetary-industry'],
      [/industry jobs/i, '/industry'],
    ];
    for (const [title, href] of destinations) {
      const card = await findCard(title);
      expect(within(card).getByRole('link', { name: /open/i })).toHaveAttribute('href', href);
    }
  });

  /*
   * Finished jobs are interchangeable — they are all "go and click deliver" —
   * so a dozen of them collapse into one row instead of pushing every running
   * job off the card. The running ones stay individual: different items,
   * different facilities, different clocks.
   */
  it('collapses delivered-ready jobs into one row and keeps running jobs separate', async () => {
    await grantScopes([INDUSTRY_SCOPE]);
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/industry/jobs`, () =>
        HttpResponse.json([
          industryJob({ jobId: 1, endsInHours: -5 }),
          industryJob({ jobId: 2, endsInHours: -2 }),
          industryJob({ jobId: 3, endsInHours: -1 }),
          industryJob({ jobId: 4, endsInHours: 6 }),
          industryJob({ jobId: 5, endsInHours: 30 }),
        ])
      )
    );
    render(<App />);

    const card = await findCard(/industry jobs/i);
    expect(await within(card).findByText(/3 jobs ready to deliver/i)).toBeInTheDocument();
    // One collapsed row plus the two still running.
    expect(within(card).getAllByRole('listitem')).toHaveLength(3);
  });

  /*
   * The board is a summary of the feed, so it groups by notification *type*
   * the same way the Alerts page does: a week away is hundreds of fires across
   * a dozen types, and a row per fire would be the entire column.
   */
  it('groups the alerts column by type and links through to the feed', async () => {
    await seedFeed([
      feedEntry({ id: 'a', eventId: 'marketOrderFilled', title: 'Market order filled' }),
      feedEntry({ id: 'b', eventId: 'marketOrderFilled', title: 'Market order filled' }),
      feedEntry({ id: 'c', eventId: 'newMail', title: 'New mail' }),
    ]);
    render(<App />);

    const card = await findCard(/^alerts$/i);
    expect(await within(card).findByText('3 unread')).toBeInTheDocument();
    const rows = within(card).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByRole('link')).toHaveAttribute('href', '/alerts');
  });

  it('puts an unread count on the rail’s Alerts entry, and nothing at all at zero', async () => {
    render(<App />);
    await screen.findByText(/1,234,567\.89/);
    const nav = within(document.querySelector('nav') as HTMLElement);
    expect(nav.getByRole('link', { name: 'Alerts' })).toHaveAttribute('href', '/alerts');

    await seedFeed([feedEntry({ id: 'a', eventId: 'newMail', title: 'New mail' })]);
    expect(await screen.findByRole('link', { name: /alerts, 1 waiting/i })).toBeInTheDocument();
  });
});

/*
 * Below `sm` the board folds: the two worst cards keep their full shape and
 * every other domain drops to one line in "Everything else".
 *
 * `vitest.setup.ts` stubs `matchMedia` to never match, so every test above
 * this point renders the wide board — narrow has to be asked for, the same way
 * `FilterBar.test.tsx` asks for it.
 */
let restoreMatchMedia: (() => void) | undefined;

function usePhoneViewport(): void {
  const real = window.matchMedia;
  window.matchMedia = (media: string) =>
    ({
      media,
      matches: media === PHONE_QUERY,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
  restoreMatchMedia = () => {
    window.matchMedia = real;
  };
}

/** The domain cards, by the heading each one carries. */
const DOMAINS = ['Open orders', 'Mining tax', 'Planetary industry', 'Industry jobs'] as const;

/** Which domains kept a full card — a card is a heading with its own "Open" link. */
function fullCardDomains(): string[] {
  return DOMAINS.filter((domain) => {
    const heading = screen.queryByRole('heading', { name: domain });
    const card = heading?.closest('section');
    return (
      card !== null &&
      card !== undefined &&
      within(card).queryByRole('link', { name: /open/i }) !== null
    );
  });
}

/** One folded row's whole accessible name, or undefined if that domain did not fold. */
function foldedRowLabel(domain: string): string | undefined {
  const panel = screen.getByRole('heading', { name: 'Everything else' }).closest('section')!;
  return within(panel)
    .getAllByRole('link')
    .map((link) => link.getAttribute('aria-label') ?? '')
    .find((label) => label.startsWith(`${domain}:`));
}

/** Which domains folded to a line — `FoldedRow` names itself "<domain>: <summary>". */
function foldedDomains(): string[] {
  const panel = screen.getByRole('heading', { name: 'Everything else' }).closest('section')!;
  return within(panel)
    .getAllByRole('link')
    .map((link) => (link.getAttribute('aria-label') ?? '').split(':')[0].trim());
}

describe('the board on a phone', () => {
  beforeEach(() => usePhoneViewport());
  afterEach(() => {
    restoreMatchMedia?.();
    restoreMatchMedia = undefined;
  });

  it('keeps two cards whole and folds the rest into one list, losing no domain', async () => {
    await grantScopes([ORDERS_SCOPE, PLANETS_SCOPE, INDUSTRY_SCOPE]);
    render(<App />);
    await screen.findByText(/1,234,567\.89/);
    await screen.findByRole('heading', { name: 'Everything else' });

    const full = fullCardDomains();
    expect(full).toHaveLength(2);
    // Every domain still has a place, and none has two. A fold that quietly
    // dropped the fourth card would look exactly like a fold that worked.
    expect([...full, ...foldedDomains()].sort()).toEqual([...DOMAINS, 'Alerts'].sort());
  });

  it('gives the full cards to the worst domains', async () => {
    // Two colonies whose extractors stopped six hours ago: `expired` is the
    // one batch kind that is unconditionally critical, so planetary cannot
    // lose the top slot to a threshold changing under this test.
    const stopped = COLONIES.slice(0, 2).map((c) => ({
      ...c,
      detail: {
        ...c.detail,
        pins: c.detail.pins.map((pin) => ({ ...pin, expiry_time: hoursFromNow(-6) })),
      },
    }));
    await grantScopes([ORDERS_SCOPE, PLANETS_SCOPE, INDUSTRY_SCOPE]);
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/planets`, () =>
        HttpResponse.json(stopped.map((c) => c.planet))
      ),
      ...stopped.map((c) =>
        http.get(
          `https://esi.evetech.net/characters/${CHAR_ID}/planets/${c.planet.planet_id}`,
          () => HttpResponse.json(c.detail)
        )
      )
    );
    render(<App />);
    await screen.findByRole('heading', { name: 'Everything else' });
    await waitFor(() => expect(fullCardDomains()).toContain('Planetary industry'));

    // And what it says when folded is its own worst news, not a generic count.
    const card = await findCard(/planetary industry/i);
    expect(within(card).getByText(/2 colonies have stopped/i)).toBeInTheDocument();
  });

  /*
   * Alerts is pinned to the folded list and never ranked against the cards.
   * It is device-wide rather than this Character's, and its volume class is
   * different from everything else here — letting one loud evening take both
   * top slots is the failure its own column was built to prevent.
   */
  it('folds alerts however loud the day is, and never spends a card on it', async () => {
    await grantScopes([ORDERS_SCOPE]);
    await seedFeed(
      Array.from({ length: 90 }, (_, i) =>
        feedEntry({
          id: `alert-${i}`,
          eventId: 'eveNotification',
          eveType: i % 2 === 0 ? 'StructureUnderAttack' : 'CorpAllBillMsg',
          title: 'Alert',
        })
      )
    );
    render(<App />);
    await screen.findByRole('heading', { name: 'Everything else' });

    /*
     * The feed arrives through a Dexie `useLiveQuery`, which lands after the
     * board's own first paint — so the row exists (saying "Nothing new.")
     * before it says this. Waiting on the text rather than on the row is what
     * makes the difference; the default 1s budget is not enough for 90 seeded
     * entries here.
     *
     * Two counts, two lookups: one key inflecting both would read "1 types".
     */
    /*
     * The feed arrives through a Dexie `useLiveQuery`, so the row exists —
     * saying "Nothing new." — before it says this.
     *
     * A floor rather than an exact 90, and a shape rather than exact figures:
     * the app's own notification poller is live in this harness and files its
     * own entry of its own type while the board renders. Pinning the numbers
     * would make this test fail on unrelated work, and they are not what it is
     * about — the two counts being *two lookups* is. One key asked to inflect
     * both would read "1 types" the moment either figure were one.
     */
    const label = await waitFor(
      () => {
        // `?? ''` rather than a non-null assertion: a domain that has not
        // folded yet simply fails the match, and `waitFor` tries again.
        const found = foldedRowLabel('Alerts') ?? '';
        expect(found).toMatch(/^Alerts: \d+ unread · \d+ types$/);
        return found;
      },
      { timeout: 5000 }
    );
    expect(Number(/(\d+) unread/.exec(label)![1])).toBeGreaterThanOrEqual(90);
    expect(fullCardDomains()).not.toContain('Alerts');
  });
});

describe('selectActiveEntryFromSorted (BUG #10)', () => {
  const NOW = Date.parse('2026-08-29T12:00:00Z');

  it('picks the entry whose window spans now, not just the first with a finish_date', () => {
    const entries = [
      // finish_date is set but this one already finished — must not win just
      // because Array#find would hit it first in insertion order.
      {
        skill_id: 1,
        queue_position: 0,
        finished_level: 1,
        start_date: '2026-08-01T00:00:00Z',
        finish_date: '2026-08-10T00:00:00Z',
      },
      {
        skill_id: 2,
        queue_position: 1,
        finished_level: 2,
        start_date: '2026-08-10T00:00:00Z',
        finish_date: '2026-09-01T00:00:00Z',
      },
    ];
    expect(selectActiveEntryFromSorted(sortQueueEntries(entries), NOW)?.skill_id).toBe(2);
  });

  it('is resilient to entries arriving out of queue_position order', () => {
    const entries = [
      {
        skill_id: 2,
        queue_position: 1,
        finished_level: 2,
        start_date: '2026-08-10T00:00:00Z',
        finish_date: '2026-09-01T00:00:00Z',
      },
      {
        skill_id: 1,
        queue_position: 0,
        finished_level: 1,
        start_date: '2026-08-01T00:00:00Z',
        finish_date: '2026-08-10T00:00:00Z',
      },
    ];
    expect(selectActiveEntryFromSorted(sortQueueEntries(entries), NOW)?.skill_id).toBe(2);
  });

  it('falls back to the first future entry when none currently spans now', () => {
    const entries = [
      {
        skill_id: 1,
        queue_position: 0,
        finished_level: 1,
        start_date: '2026-09-01T00:00:00Z',
        finish_date: '2026-09-10T00:00:00Z',
      },
    ];
    expect(selectActiveEntryFromSorted(sortQueueEntries(entries), NOW)?.skill_id).toBe(1);
  });

  it('skips paused entries with no start/finish date', () => {
    const entries = [
      { skill_id: 1, queue_position: 0, finished_level: 1 },
      {
        skill_id: 2,
        queue_position: 1,
        finished_level: 2,
        start_date: '2026-08-10T00:00:00Z',
        finish_date: '2026-09-01T00:00:00Z',
      },
    ];
    expect(selectActiveEntryFromSorted(sortQueueEntries(entries), NOW)?.skill_id).toBe(2);
  });

  it('returns null for an empty queue', () => {
    expect(selectActiveEntryFromSorted([], NOW)).toBeNull();
  });
});

describe('sortQueueEntries', () => {
  it('orders entries by queue_position, leaving the input untouched', () => {
    const entries = [
      { skill_id: 2, queue_position: 1, finished_level: 2 },
      { skill_id: 1, queue_position: 0, finished_level: 1 },
    ];
    const sorted = sortQueueEntries(entries);
    expect(sorted.map((e) => e.skill_id)).toEqual([1, 2]);
    expect(entries.map((e) => e.skill_id)).toEqual([2, 1]);
  });
});

describe('selectQueueDepth', () => {
  const NOW = Date.parse('2026-08-29T12:00:00Z');

  it('reports empty for no entries at all', () => {
    expect(selectQueueDepth([], NOW)).toEqual({
      status: 'empty',
      count: 0,
      totalRemainingSeconds: 0,
      finalFinishDate: null,
    });
  });

  it('reports paused when entries exist but none carry start/finish dates', () => {
    const entries = [
      { skill_id: 1, queue_position: 0, finished_level: 1 },
      { skill_id: 2, queue_position: 1, finished_level: 2 },
    ];
    expect(selectQueueDepth(entries, NOW)).toEqual({
      status: 'paused',
      count: 2,
      totalRemainingSeconds: 0,
      finalFinishDate: null,
    });
  });

  it('counts entries and sums remaining time to the last entry finish date', () => {
    const entries = [
      {
        skill_id: 1,
        queue_position: 0,
        finished_level: 1,
        start_date: '2026-08-29T12:00:00Z',
        finish_date: '2026-08-30T12:00:00Z', // +1d
      },
      {
        skill_id: 2,
        queue_position: 1,
        finished_level: 2,
        start_date: '2026-08-30T12:00:00Z',
        finish_date: '2026-09-02T12:00:00Z', // +4d total from NOW
      },
    ];
    const depth = selectQueueDepth(entries, NOW);
    expect(depth.status).toBe('training');
    expect(depth.count).toBe(2);
    expect(depth.totalRemainingSeconds).toBe(4 * 86_400);
    expect(depth.finalFinishDate).toBe('2026-09-02T12:00:00Z');
  });

  it('clamps remaining time at zero for a final finish already in the past', () => {
    const entries = [
      {
        skill_id: 1,
        queue_position: 0,
        finished_level: 1,
        start_date: '2026-08-01T00:00:00Z',
        finish_date: '2026-08-10T00:00:00Z',
      },
    ];
    expect(selectQueueDepth(entries, NOW).totalRemainingSeconds).toBe(0);
  });
});
