import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { db } from '@/db';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
import { App } from '@/app/App';
import * as routeChunks from '@/app/routeChunks';
import type { SkillType } from '@/sde/types';
import { PHONE_QUERY } from '@/lib/useIsPhone';
import {
  OVERVIEW_HIDDEN_CARDS_KEY,
  useOverviewCardOrder,
  useOverviewHiddenCards,
} from '@/features/overview/widgets/migrate';
import { OVERVIEW_LAYOUT_KEY, useOverviewLayout } from '@/features/overview/widgets/layoutStore';
import type { OverviewLayout, Widget } from '@/features/overview/widgets/layout';
import { priceAlertDomain } from '@/features/notifications/pollDomains/priceAlerts';
import {
  useSpExtractionMonitoringEnabled,
  useSpExtractionThresholdSp,
} from '@/features/character/spExtractionSettings';

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
  loadMarketWideTrees: vi.fn(async () => ({})),
}));

const CHAR_ID = 91;
const OTHER_ID = 92;

const skillsPayload = {
  skills: [
    { skill_id: 3300, trained_skill_level: 4, active_skill_level: 4, skillpoints_in_skill: 90000 },
  ],
  total_sp: 5_000_000,
  unallocated_sp: 12_000,
};

// Relative to the instant the suite runs: the board feeds this into
// `selectActiveEntryFromSorted(..., Date.now())`, so a fixed pair of dates would
// eventually fall out of the window and the entry would stop being "active".
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
  http.get('https://esi.evetech.net/characters/:id/wallet', () => HttpResponse.json(1234567.89)),
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
  http.get(`https://esi.evetech.net/characters/${OTHER_ID}`, () =>
    HttpResponse.json({
      name: 'Pilot Two',
      corporation_id: 1001,
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
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/mining/`, () => HttpResponse.json([])),
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/calendar`, () => HttpResponse.json([])),
  http.get('https://market.fuzzwork.co.uk/aggregates/', () => HttpResponse.json({})),
  http.get('https://esi.evetech.net/universe/types/:typeId', () =>
    HttpResponse.json({ type_id: 3300, name: 'Gunnery', group_id: 10, published: true })
  ),
  http.post('https://esi.evetech.net/universe/names', () => HttpResponse.json([])),
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/mail`, () =>
    HttpResponse.json([
      {
        mail_id: 1,
        subject: 'Docking fee',
        from: 5,
        timestamp: new Date(Date.now() - 3_600_000).toISOString(),
        is_read: false,
        labels: [1],
      },
    ])
  ),
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/mail/labels`, () =>
    HttpResponse.json({ labels: [], total_unread_count: 3 })
  ),
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

const MAIL_SCOPE = 'esi-mail.read_mail.v1';
const CALENDAR_SCOPE = 'esi-calendar.read_calendar_events.v1';

beforeAll(async () => {
  server.listen({ onUnhandledRequest: 'error' });
  // One throwaway render, so no test pays for the worker's first `App` render
  // (lazy route chunks, jsdom, React warm-up) inside a short `findBy` wait.
  await routeChunks.loadOverview();
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
  const { unmount } = render(<App />);
  await screen.findByRole('heading', { name: 'Pilot One' }, { timeout: 25_000 });
  unmount();
  server.resetHandlers();
}, 30_000);
afterAll(() => server.close());
afterEach(() => server.resetHandlers());

beforeEach(async () => {
  await db.characters.clear();
  await db.tokens.clear();
  await db.settings.clear();
  await db.esiCache.clear();
  await db.notificationFeed.clear();
  await db.quickbars.clear();
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
  usePublicInfo.setState({ byCharacterId: {} });
  useOverviewHiddenCards.setState({ value: [], hydrated: false });
  useOverviewCardOrder.setState({ value: [], hydrated: false });
  useOverviewLayout.setState({ value: null, hydrated: false });
  priceAlertDomain.store.setState({ value: {}, hydrated: false });
  useSpExtractionMonitoringEnabled.setState({ value: false, hydrated: false });
  useSpExtractionThresholdSp.setState({ value: 500_000, hydrated: false });

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

async function grantScopes(scopes: readonly string[]): Promise<void> {
  const token = await db.tokens.get(CHAR_ID);
  await db.tokens.put({ ...token!, scopes: [...(token?.scopes ?? []), ...scopes] });
}

function widget(id: string, kind: string, patch: Partial<Widget> = {}): Widget {
  return { id, kind, size: 'M', view: 'number', scope: 'header', showOnPhone: true, ...patch };
}

async function seedLayout(...widgets: Widget[]): Promise<void> {
  const layout: OverviewLayout = { version: 1, widgets };
  await db.settings.put({ key: OVERVIEW_LAYOUT_KEY, value: layout });
}

const widgetCard = (name: string) => screen.findByRole('region', { name });

async function storedKinds(): Promise<string[] | undefined> {
  const row = await db.settings.get(OVERVIEW_LAYOUT_KEY);
  return (row?.value as OverviewLayout | undefined)?.widgets.map((w) => w.kind);
}

describe('Overview widget grid', () => {
  it('asks a first-time pilot what to start from, then builds the basics and saves them', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: /what do you do in eve/i })
    ).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Wallet' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /just the basics/i }));

    for (const name of ['Wallet', 'Training', 'Coming up', 'Mail']) {
      expect(await widgetCard(name)).toBeInTheDocument();
    }
    await waitFor(async () =>
      expect(await storedKinds()).toEqual(['wallet', 'training', 'comingUp', 'mail'])
    );
  });

  it('builds from the chosen roles', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('heading', { name: /what do you do in eve/i });
    await user.click(screen.getByRole('button', { name: 'Planetary industry' }));
    await user.click(screen.getByRole('button', { name: 'Build my Overview' }));
    expect(await widgetCard('Planetary')).toBeInTheDocument();
    await waitFor(async () =>
      expect(await storedKinds()).toEqual(['wallet', 'training', 'comingUp', 'mail', 'planetary'])
    );
  });

  it('customizes from the header: the edit bar takes over Done, and Cancel restores', async () => {
    await seedLayout(widget('a', 'wallet', { size: 'S' }), widget('b', 'training', { size: 'S' }));
    const user = userEvent.setup();
    render(<App />);
    await widgetCard('Wallet');
    await user.click(
      await within(screen.getByRole('main')).findByRole('button', { name: 'Customize' })
    );
    expect(
      await screen.findByRole('region', { name: 'Customize the Overview' })
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Done' })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Remove Training' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await widgetCard('Training')).toBeInTheDocument();
    await waitFor(async () => expect(await storedKinds()).toEqual(['wallet', 'training']));
  });

  it('draws the saved layout: the wallet figure, and the skill training now', async () => {
    await seedLayout(widget('a', 'wallet', { size: 'S' }), widget('b', 'training', { size: 'S' }));
    render(<App />);

    const wallet = await widgetCard('Wallet');
    expect(await within(wallet).findByText('1.2M')).toBeInTheDocument();
    const training = await widgetCard('Training');
    expect(await within(training).findByText(/Gunnery/)).toBeInTheDocument();
    // Nothing on the board carries a New tag: every widget is new.
    expect(screen.queryByText('New')).not.toBeInTheDocument();
  });

  it('says nothing about cached data while every read is fresh, and names it once one is cached', async () => {
    await seedLayout(widget('a', 'wallet', { size: 'S' }), widget('n', 'netWorth', { size: 'S' }));
    const { unmount } = render(<App />);
    await widgetCard('Wallet');
    expect(await screen.findByRole('button', { name: /Data updated/ })).toBeInTheDocument();
    // A Net Worth widget reads recorded history, which is not a cached read.
    expect(screen.queryByText('Showing cached data')).not.toBeInTheDocument();
    unmount();

    // The saved balance answers when ESI cannot.
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: 'wallet:balance',
      value: 1_000_000,
      fetchedAt: Date.now() - 3 * 3_600_000,
    });
    server.use(
      http.get('https://esi.evetech.net/characters/:id/wallet', () => HttpResponse.error())
    );
    render(<App />);
    await widgetCard('Wallet');
    expect(await screen.findByText('Showing cached data')).toBeInTheDocument();
  });

  it('offers the training finish as the header Next deadline', async () => {
    await seedLayout(widget('b', 'training', { size: 'S' }));
    render(<App />);
    const next = await screen.findByRole('link', { name: /next skill finishes/i });
    expect(next).toHaveAttribute('href', '/skills/plans');
    // A real button-styled link, not static text.
    expect(next).toHaveClass('border', 'rounded-xs');
  });

  it('turns a returning pilot hidden-card list into a layout, saved once', async () => {
    const hidden = [
      'orders',
      'mining',
      'contracts',
      'planetary',
      'industry',
      'structures',
      'moonChunks',
      'comingUp',
      'spExtraction',
      'priceAlerts',
      'stock',
    ];
    await db.settings.put({ key: OVERVIEW_HIDDEN_CARDS_KEY, value: hidden });
    await grantScopes([MAIL_SCOPE]);
    render(<App />);

    expect(await widgetCard('Wallet')).toBeInTheDocument();
    expect(await widgetCard('Training')).toBeInTheDocument();
    expect(await widgetCard('Mail')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Open orders' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /set up your overview/i })
    ).not.toBeInTheDocument();
    await waitFor(async () => expect(await storedKinds()).toEqual(['wallet', 'training', 'mail']));
  });

  it('shows unread mail as a headline count with the newest mails as rows in List view', async () => {
    await grantScopes([MAIL_SCOPE]);
    await seedLayout(widget('m', 'mail', { view: 'table' }));
    render(<App />);

    const mail = await widgetCard('Mail');
    expect(await within(mail).findByText('Docking fee')).toBeInTheDocument();
    // The headline is on screen in the List view too.
    expect(within(mail).getByText('3')).toBeInTheDocument();
  });

  it('asks for the permission instead of printing a zero when a grant is missing', async () => {
    await seedLayout(widget('o', 'orders'));
    render(<App />);

    const orders = await widgetCard('Open orders');
    expect(await within(orders).findByText('Needs permission')).toBeInTheDocument();
    expect(within(orders).getByRole('button', { name: 'Grant access' })).toBeInTheDocument();
  });

  it('says what is missing when a widget has nothing, and Remove widget drops and saves it', async () => {
    const user = userEvent.setup();
    await grantScopes([CALENDAR_SCOPE]);
    await seedLayout(widget('w', 'wallet', { size: 'S' }), widget('c', 'comingUp'));
    render(<App />);

    const coming = await widgetCard('Coming up');
    expect(
      await within(coming).findByText('No accepted or tentative events ahead.')
    ).toBeInTheDocument();
    await user.click(within(coming).getByRole('button', { name: 'Remove widget' }));

    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Coming up' })).not.toBeInTheDocument()
    );
    expect(await widgetCard('Wallet')).toBeInTheDocument();
    await waitFor(async () => expect(await storedKinds()).toEqual(['wallet']));
  });

  it("keeps a widget's All characters scope, and says what cannot sum", async () => {
    await db.characters.put({
      characterId: OTHER_ID,
      name: 'Pilot Two',
      ownerHash: 'oh2',
      addedAt: 2,
    });
    await seedLayout(widget('w', 'wallet', { size: 'S', scope: 'all' }));
    render(<App />);

    // The wallet cannot sum, so it says it is still one Character's.
    const wallet = await widgetCard('Wallet');
    expect(await within(wallet).findByText('Pilot One only')).toBeInTheDocument();
  });

  it('draws no Character switcher in the header, and no SP chips', async () => {
    await db.characters.put({
      characterId: OTHER_ID,
      name: 'Pilot Two',
      ownerHash: 'oh2',
      addedAt: 2,
    });
    await seedLayout(widget('w', 'wallet', { size: 'S' }));
    render(<App />);

    await widgetCard('Wallet');
    const main = within(screen.getByRole('main'));
    expect(main.queryByRole('button', { name: /character: /i })).not.toBeInTheDocument();
    expect(main.queryByText('Total SP')).not.toBeInTheDocument();
    expect(main.queryByText('Unallocated SP')).not.toBeInTheDocument();
    // No header Refresh; the data age sits on the tab row, not beside the name.
    expect(main.queryByRole('button', { name: 'Refresh' })).not.toBeInTheDocument();
    const heading = main.getByRole('heading', { level: 1 });
    const dataAge = await main.findByRole('button', { name: /Data updated/ });
    expect(heading.parentElement).not.toContainElement(dataAge);
  });

  it('opens a per-widget table of when each read landed from the data age', async () => {
    await seedLayout(widget('w', 'wallet', { size: 'S' }));
    render(<App />);

    await widgetCard('Wallet');
    const trigger = await screen.findByRole('button', { name: /Data updated/ });
    await userEvent.click(trigger);
    const table = await screen.findByRole('table', { name: /last read its data/i });
    expect(within(table).getByRole('rowheader', { name: 'Wallet' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh all widgets' })).toBeInTheDocument();
  });
});

/*
 * `vitest.setup.ts` stubs `matchMedia` to never match, so everything above
 * renders the wide grid; a phone has to be asked for.
 */
describe('Overview widget grid on a phone', () => {
  let real: typeof window.matchMedia;
  beforeEach(() => {
    real = window.matchMedia;
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
  });
  afterEach(() => {
    window.matchMedia = real;
  });

  it('leaves out a widget set to Hide on phone, and keeps the rest', async () => {
    await seedLayout(
      widget('w', 'wallet', { size: 'S' }),
      widget('t', 'training', { size: 'S', showOnPhone: false })
    );
    render(<App />);

    expect(await widgetCard('Wallet')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Training' })).not.toBeInTheDocument();
  });
});
