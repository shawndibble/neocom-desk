import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { db } from '@/db';
import { useCharacterFilterPicks } from '@/features/character/characterFilterPicks';
import { useDefaultCharacterFilter } from '@/features/character/defaultCharacterFilter';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import '@/i18n';
import { useActiveCharacter } from '@/stores/activeCharacter';
import * as download from '@/lib/download';
import { beginEveLogin } from '@/app/loginFlow';
import { OpenOrdersPanel } from './OpenOrdersPanel';
import { WithPageHeaderSlots } from './__fixtures__/pageHeaderSlots';
import { fakeItemActions, FakeItemActions } from './__fixtures__/itemActions';
import { loadAllCharactersOpenOrders, type OpenOrdersSnapshot } from './openOrdersData';
import { loadOrderCostBases, type ProductionRunBasis } from './orderCostBasis';
import { loadStationBestPrices } from './orderCompetition';
import { stationPriceKey } from './stationPriceKey';
import {
  fakeOrderDetailLoaders,
  withOrderDetailLoaders,
  type FakeOrderDetailLoaders,
} from './__fixtures__/orderDetailLoaders';
import { loadTypeNames } from '@/features/character/typeNames';
import { loadNpcStations } from '@/sde/loadMarketSde';
import { loadCorrectedSkills, type CorrectedSkills } from '@/features/skills/correctedSkills';
import type { MarketOrder } from '@/esi/endpoints';
import { historyPoint } from '@/engine/market/__fixtures__/priceHistory';
import { orderFloor } from '@/engine/market/orderFloor';
import { roundPriceUp } from '@/engine/market/priceTick';
import { formatMarketIsk } from '@/lib/isk';
import { useVisibleOpenOrderColumns } from './openOrdersColumns';
import {
  loadCorpOrdersFeed,
  type CorpOrdersFeed,
} from '@/features/overview/widgets/data/corpFeeds';

vi.mock('./openOrdersData', () => ({ loadAllCharactersOpenOrders: vi.fn() }));
vi.mock('./orderCostBasis', () => ({
  loadOrderCostBases: vi.fn(),
  loadWalletOrderCostBases: vi.fn(async () => ({ bases: new Map(), gaps: new Map() })),
}));
// The snapshot's own station-price tier. Order Detail's fetches go through
// its fake loaders instead (`loaders` below).
vi.mock('./orderCompetition', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./orderCompetition')>()),
  loadStationBestPrices: vi.fn(),
}));
vi.mock('@/features/character/typeNames', () => ({ loadTypeNames: vi.fn() }));
vi.mock('@/sde/loadMarketSde', () => ({ loadNpcStations: vi.fn() }));
vi.mock('@/features/skills/correctedSkills', () => ({ loadCorrectedSkills: vi.fn() }));
vi.mock('@/app/loginFlow', () => ({ beginEveLogin: vi.fn() }));
vi.mock('@/features/overview/widgets/data/corpFeeds', () => ({ loadCorpOrdersFeed: vi.fn() }));

const mockedLoadAll = vi.mocked(loadAllCharactersOpenOrders);
const mockedCostBases = vi.mocked(loadOrderCostBases);
const mockedStationPrices = vi.mocked(loadStationBestPrices);
const mockedTypeNames = vi.mocked(loadTypeNames);
const mockedNpcStations = vi.mocked(loadNpcStations);
const mockedSkills = vi.mocked(loadCorrectedSkills);

const REGION = 10000002;
const STATION_A = 60003760;

const TYPE_NAMES = new Map([
  [34, 'Tritanium'],
  [35, 'Pyerite'],
  [36, 'Mexallon'],
]);

function order(
  fields: Pick<MarketOrder, 'order_id' | 'type_id' | 'price'> & Partial<MarketOrder>
): MarketOrder {
  return {
    region_id: REGION,
    location_id: STATION_A,
    is_buy_order: false,
    is_corporation: false,
    volume_remain: 10,
    volume_total: 10,
    issued: new Date(Date.now() - 30 * 86_400_000).toISOString(),
    duration: 90,
    range: 'station',
    ...fields,
  };
}

function skillsFixture(trained: [number, number][]): CorrectedSkills {
  return {
    skillsResult: null,
    skillsNeedsReauth: false,
    queueResult: null,
    queueNeedsReauth: false,
    completedLevels: new Map(),
    trained: new Map(trained.map(([id, level]) => [id, { level, sp: 0 }])),
    effective: new Map(trained.map(([id, level]) => [id, level])),
    completedSp: 0,
    totalSp: null,
    fetchedAt: null,
  };
}

function costBasis(unitCost: number): ProductionRunBasis {
  return {
    unitCost,
    runId: 'run-1',
    runQuantity: 10,
    materialCost: unitCost * 5,
    jobFee: unitCost * 2,
  };
}

/** Sell order below floor: unit cost of 600 with any skill level always relists well above 500. */
const BELOW_FLOOR_ORDER = order({ order_id: 101, type_id: 34, price: 500 });
/** Healthy-looking sell order with no cost basis linked at all. */
const NO_COST_BASIS_ORDER = order({
  order_id: 103,
  type_id: 35,
  price: 700,
  volume_remain: 20,
  volume_total: 20,
});
/** Sell order expiring within the week — no cost basis needed for this problem to fire. */
const EXPIRING_ORDER = order({
  order_id: 201,
  type_id: 36,
  price: 300,
  issued: new Date().toISOString(),
  duration: 5,
  volume_remain: 5,
  volume_total: 5,
});

function snapshot(
  entries: OpenOrdersSnapshot['entries'],
  skipped: OpenOrdersSnapshot['skipped'] = []
): OpenOrdersSnapshot {
  return { entries, skipped };
}

const actions = fakeItemActions();
/** Order Detail's fetches, fresh per test: region books and price history never resolve unless a test says so. */
let loaders: FakeOrderDetailLoaders;

function renderPanel(initialEntry = '/market/orders') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <FakeItemActions actions={actions}>
        {withOrderDetailLoaders(
          <WithPageHeaderSlots>
            {(slots) => <OpenOrdersPanel headerSlots={slots} />}
          </WithPageHeaderSlots>,
          loaders
        )}
      </FakeItemActions>
    </MemoryRouter>
  );
}

/** Renders the current URL's search string alongside the panel, for asserting `?highlight=` is spent on arrival (issue #1423). */
function CurrentSearch() {
  const location = useLocation();
  return <p data-testid="location-search">{location.search}</p>;
}

function renderPanelWithLocation(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <CurrentSearch />
      <FakeItemActions actions={actions}>
        {withOrderDetailLoaders(
          <WithPageHeaderSlots>
            {(slots) => <OpenOrdersPanel headerSlots={slots} />}
          </WithPageHeaderSlots>,
          loaders
        )}
      </FakeItemActions>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useCharacterFilterPicks.setState({ value: {}, hydrated: false });
  useDefaultCharacterFilter.setState({ value: 'all', hydrated: true });
  useActiveCharacter.setState({ activeCharacterId: 1, hydrated: true });
  mockedTypeNames.mockResolvedValue(TYPE_NAMES);
  mockedNpcStations.mockResolvedValue([
    { id: STATION_A, name: 'Jita IV - Moon 4', systemId: 30000142 },
  ]);
  // The real loader returns an entry (null prices = no orders) for every type
  // of each station it reached; an absent entry means the station's fetch failed.
  mockedStationPrices.mockImplementation(
    async (requests) =>
      new Map(
        requests.flatMap(({ stationId, typeIds }) =>
          typeIds.map(
            (typeId) =>
              [
                stationPriceKey(stationId, typeId),
                { sellMin: null, buyMax: null, sellVolume: 0, buyVolume: 0 },
              ] as const
          )
        )
      )
  );
  mockedCostBases.mockResolvedValue(new Map());
  mockedSkills.mockResolvedValue(
    skillsFixture([
      [16622, 5],
      [3446, 5],
    ])
  );
  // Deep checks (and price history, for the "sells out in" chip) are
  // on-demand only — the fake never resolves either, so a test that doesn't
  // care about them never has to wait on them.
  loaders = fakeOrderDetailLoaders();
  useVisibleOpenOrderColumns.setState({ value: [], hydrated: true });
});

/** The sr-only `LiveStatus` count. */
async function findMatchCount(text: string) {
  await waitFor(() =>
    expect(screen.getAllByRole('status').some((el) => el.textContent === text)).toBe(true)
  );
}

function entry(
  orders: MarketOrder[],
  overrides: Partial<OpenOrdersSnapshot['entries'][number]> = {}
): OpenOrdersSnapshot['entries'][number] {
  return {
    characterId: 1,
    characterName: 'Alpha',
    orders,
    fetchedAt: Date.now(),
    fromCache: false,
    needsReauth: false,
    ...overrides,
  };
}

/** The table on screen, by the segment it shows. */
const NEEDS_YOU_TABLE = { name: 'Orders that need you' } as const;

describe('OpenOrdersPanel', () => {
  it("grants for the lapsed Character's own grant, not the active one's, and names them", async () => {
    mockedLoadAll.mockResolvedValue(
      snapshot([
        entry([EXPIRING_ORDER]),
        entry([], { characterId: 2, characterName: 'Bravo', fetchedAt: 0, needsReauth: true }),
      ])
    );
    const user = userEvent.setup();
    renderPanel();

    expect(await screen.findByText('Bravo — Log in again to see your orders')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Log in again with EVE Online' }));
    expect(beginEveLogin).toHaveBeenCalledWith({ characterId: 2, groups: ['marketOrders'] });
  });

  it('carries the item context menu on order rows and asks for the blueprint catalog on open', async () => {
    mockedLoadAll.mockResolvedValue(snapshot([entry([EXPIRING_ORDER])]));
    renderPanel();

    const row = await screen.findByRole('row', { name: /Mexallon/ });
    expect(actions.requestBlueprints).not.toHaveBeenCalled();
    fireEvent.contextMenu(row);

    fireEvent.click(await screen.findByRole('menuitem', { name: 'Show info' }));
    expect(actions.showInfo).toHaveBeenCalledWith(36, 'Mexallon');
    expect(actions.requestBlueprints).toHaveBeenCalled();
  });

  it('lists what needs you worst first in one flat table, with no group headers', async () => {
    mockedLoadAll.mockResolvedValue(snapshot([entry([EXPIRING_ORDER, BELOW_FLOOR_ORDER])]));
    mockedCostBases.mockResolvedValue(new Map([[101, costBasis(600)]]));

    renderPanel();

    const table = await screen.findByRole('table', NEEDS_YOU_TABLE);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((row) => within(row).getAllByRole('cell')[0].textContent)).toEqual([
      expect.stringContaining('Tritanium'),
      expect.stringContaining('Mexallon'),
    ]);
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((th) => th.textContent)
    ).toEqual(expect.arrayContaining(['Item', "What's wrong", 'Do this', 'ISK tied up']));
    expect(screen.queryByText('Priced below cost')).not.toBeInTheDocument();
    expect(screen.queryByText('Expiring or stale')).not.toBeInTheDocument();
  });

  it('says what to do with the exact price to copy, and the short station under the item', async () => {
    mockedLoadAll.mockResolvedValue(snapshot([entry([BELOW_FLOOR_ORDER])]));
    mockedCostBases.mockResolvedValue(new Map([[101, costBasis(600)]]));

    renderPanel();

    const row = await screen.findByRole('row', { name: /Tritanium/ });
    expect(row).toHaveTextContent('Jita IV');
    expect(row).toHaveTextContent('Below floor');
    expect(within(row).getByRole('button', { name: /^Put the price up: / })).toBeInTheDocument();
    // Sentence and copy button live in the detail.
    expect(row).not.toHaveTextContent('Selling at this price loses');
  });

  it('heads the list with what needs you, the ISK in it, and what is left', async () => {
    mockedLoadAll.mockResolvedValue(
      snapshot([entry([BELOW_FLOOR_ORDER, EXPIRING_ORDER, NO_COST_BASIS_ORDER])])
    );
    mockedCostBases.mockResolvedValue(new Map([[101, costBasis(600)]]));

    renderPanel();

    expect(await screen.findByRole('heading', { name: '2 orders need you' })).toBeInTheDocument();
    // 500 x 10 + 300 x 5.
    const line = screen.getByText(/ISK tied up in them/).closest('p');
    expect(line).toHaveTextContent('6.5K');
    expect(line).toHaveTextContent(/ISK tied up in them · 0 to watch · 1 fine/);
    expect(screen.getByRole('button', { name: 'Needs you (2)' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Watch (0)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All (3)' })).toBeInTheDocument();
  });

  it('shows Watch and All one segment away, and remembers the pick in the URL', async () => {
    const user = userEvent.setup();
    mockedStationPrices.mockResolvedValue(new Map());
    mockedLoadAll.mockResolvedValue(snapshot([entry([EXPIRING_ORDER, NO_COST_BASIS_ORDER])]));

    renderPanelWithLocation('/market/orders');

    await screen.findByRole('table', NEEDS_YOU_TABLE);
    await user.click(screen.getByRole('button', { name: 'Watch (1)' }));
    const watch = await screen.findByRole('table', { name: 'Orders to watch' });
    expect(within(watch).getByRole('row', { name: /Pyerite/ })).toBeInTheDocument();
    expect(within(watch).queryByRole('row', { name: /Mexallon/ })).not.toBeInTheDocument();
    expect(screen.getByTestId('location-search').textContent).toContain('orders.view=watch');

    await user.click(screen.getByRole('button', { name: 'All (2)' }));
    const all = await screen.findByRole('table', { name: 'All orders' });
    expect(within(all).getAllByRole('row')).toHaveLength(3);
  });

  it('has no character control and no per-row character marker with one character', async () => {
    mockedLoadAll.mockResolvedValue(snapshot([entry([BELOW_FLOOR_ORDER])]));
    mockedCostBases.mockResolvedValue(new Map([[101, costBasis(600)]]));

    renderPanel();

    await screen.findByRole('table', NEEDS_YOU_TABLE);
    expect(screen.queryByText(/All characters/)).not.toBeInTheDocument();
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument();
  });

  it('puts the character filter in the page header once more than one character has orders, and narrows the table on a pick', async () => {
    mockedLoadAll.mockResolvedValue(
      snapshot([
        entry([BELOW_FLOOR_ORDER]),
        entry([EXPIRING_ORDER], { characterId: 2, characterName: 'Bravo' }),
      ])
    );
    mockedCostBases.mockImplementation(async (characterId: number) =>
      characterId === 1 ? new Map([[101, costBasis(600)]]) : new Map()
    );

    const user = userEvent.setup();
    renderPanel();

    const table = await screen.findByRole('table', NEEDS_YOU_TABLE);
    // Each row names its owner.
    expect(within(table).getByRole('row', { name: /Mexallon/ })).toHaveTextContent('Bravo');
    const trigger = within(screen.getByRole('banner')).getByRole('button', {
      name: 'All characters · 2',
    });

    await user.click(trigger);
    // The active Character (from `useActiveCharacter`) is Alpha (id 1).
    await user.click(screen.getByRole('menuitemradio', { name: 'This character' }));

    expect(await screen.findByText('Tritanium')).toBeInTheDocument();
    expect(screen.queryByText('Mexallon')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'This character' })).toBeInTheDocument();
  });

  it('opens on the Settings default when nothing is remembered, then on the last pick', async () => {
    mockedLoadAll.mockResolvedValue(
      snapshot([
        entry([BELOW_FLOOR_ORDER]),
        entry([EXPIRING_ORDER], { characterId: 2, characterName: 'Bravo' }),
      ])
    );
    useDefaultCharacterFilter.setState({ value: 'current', hydrated: true });
    const user = userEvent.setup();
    const first = renderPanel();

    // First visit: the Settings default seeds the page.
    expect(await screen.findByRole('button', { name: 'This character' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'This character' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'All characters · 2' }));
    expect(await screen.findByText('Mexallon')).toBeInTheDocument();
    first.unmount();

    // A fresh visit (no query string) reopens the last pick, not the default.
    renderPanel();
    expect(await screen.findByRole('button', { name: 'All characters · 2' })).toBeInTheDocument();
    expect(await screen.findByText('Mexallon')).toBeInTheDocument();
  });

  it('folds healthy orders to one line under the list until Show is pressed', async () => {
    const user = userEvent.setup();
    mockedLoadAll.mockResolvedValue(snapshot([entry([EXPIRING_ORDER, NO_COST_BASIS_ORDER])]));

    renderPanel();

    const table = await screen.findByRole('table', NEEDS_YOU_TABLE);
    expect(within(table).queryByText('Pyerite')).not.toBeInTheDocument();
    expect(screen.getByText('1 healthy order')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show' }));
    const all = await screen.findByRole('table', { name: 'All orders' });
    expect(within(all).getByText('Pyerite')).toBeInTheDocument();
    expect(screen.queryByText('1 healthy order')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'What do these badges mean?' })).toBeInTheDocument();
  });

  it('exports every order the funnel matched, any segment, from the page-header menu', async () => {
    const spy = vi.spyOn(download, 'downloadTextFile').mockImplementation(() => {});
    const user = userEvent.setup();
    mockedLoadAll.mockResolvedValue(
      snapshot([entry([BELOW_FLOOR_ORDER, EXPIRING_ORDER, NO_COST_BASIS_ORDER])])
    );
    mockedCostBases.mockResolvedValue(new Map([[101, costBasis(600)]]));

    renderPanel();
    await screen.findByRole('table', NEEDS_YOU_TABLE);

    const header = screen.getByRole('banner');
    expect(
      within(header).getByRole('button', { name: 'Refresh orders & market prices' })
    ).toBeInTheDocument();
    expect(header.querySelector('time')).not.toBeNull();
    fireEvent.pointerDown(within(header).getByRole('button', { name: 'Export Open orders' }), {
      button: 0,
      pointerType: 'mouse',
    });
    (await screen.findByRole('menuitem', { name: 'Download CSV' })).focus();
    await user.keyboard('{Enter}');

    await waitFor(() => expect(spy).toHaveBeenCalledOnce());
    expect(spy.mock.calls[0][0]).toMatch(/^neocom-orders-open-\d{4}-\d{2}-\d{2}\.csv$/);
    const csv = spy.mock.calls[0][1] as string;
    expect(csv).toContain('"Tritanium","Sell",500,');
    expect(csv).toContain(`"${TYPE_NAMES.get(EXPIRING_ORDER.type_id)}","Sell",`);
    expect(csv).toContain(`"${TYPE_NAMES.get(NO_COST_BASIS_ORDER.type_id)}","Sell",`);
    spy.mockRestore();
  });

  it('files an order nobody could check under Watch, never Fine', async () => {
    const user = userEvent.setup();
    mockedStationPrices.mockResolvedValue(new Map());
    mockedLoadAll.mockResolvedValue(snapshot([entry([NO_COST_BASIS_ORDER])]));

    renderPanel();

    expect(await screen.findByText(/1 to watch · 0 fine/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Watch (1)' }));
    const row = within(await screen.findByRole('table', { name: 'Orders to watch' })).getByRole(
      'row',
      { name: /Pyerite/ }
    );
    expect(within(row).getByText('Not checked')).toBeInTheDocument();
    expect(within(row).getByText('Nothing to do yet')).toBeInTheDocument();
    expect(within(row).queryByText('Best price')).not.toBeInTheDocument();
  });

  it('all healthy: says nothing needs you, with the healthy fold, not a failed match', async () => {
    mockedLoadAll.mockResolvedValue(snapshot([entry([NO_COST_BASIS_ORDER])]));

    renderPanel();

    expect(await screen.findByRole('heading', { name: 'Nothing needs you' })).toBeInTheDocument();
    expect(screen.getByText('Nothing needs you right now.')).toBeInTheDocument();
    expect(screen.getByText('1 healthy order')).toBeInTheDocument();
    expect(screen.queryByText('No orders match your filters.')).not.toBeInTheDocument();
  });

  // issue #1423: a marketOrderUndercut (or marketOrderFilled) notification
  // deep-links here with `?highlight=<orderId>`, per decision
  // `20260908-123516` — the row must land on screen and pulsed even when it
  // is a healthy order the default segment leaves out.
  describe('?highlight= deep link (issue #1423)', () => {
    it('opens All and pulses the highlighted row, until the pilot picks a segment', async () => {
      const user = userEvent.setup();
      const scrollIntoView = vi
        .spyOn(Element.prototype, 'scrollIntoView')
        .mockImplementation(() => {});
      mockedLoadAll.mockResolvedValue(snapshot([entry([EXPIRING_ORDER, NO_COST_BASIS_ORDER])]));

      renderPanel('/market/orders?highlight=103');

      const table = await screen.findByRole('table', { name: 'All orders' });
      expect(screen.getByRole('button', { name: 'All (2)' })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      const pulsed = within(table).getByText('Pyerite').closest('[data-row-key]');
      expect(pulsed).toHaveAttribute('data-row-key', '103');
      expect(pulsed?.className).toContain('row-pulse');
      expect(scrollIntoView.mock.instances).toContain(pulsed);
      scrollIntoView.mockRestore();

      await user.click(screen.getByRole('button', { name: 'Needs you (1)' }));
      expect(await screen.findByRole('table', NEEDS_YOU_TABLE)).toBeInTheDocument();
    });

    it('is harmless when the highlighted id matches no order — a stale link, or an order since closed', async () => {
      mockedLoadAll.mockResolvedValue(snapshot([entry([EXPIRING_ORDER, NO_COST_BASIS_ORDER])]));

      renderPanel('/market/orders?highlight=999999');

      // Needs you, same as with no highlight at all.
      expect(await screen.findByRole('table', NEEDS_YOU_TABLE)).toBeInTheDocument();
    });

    it('spends the highlight param on arrival, matched or not', async () => {
      vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {});
      mockedLoadAll.mockResolvedValue(snapshot([entry([NO_COST_BASIS_ORDER])]));

      renderPanelWithLocation('/market/orders?highlight=103');

      await screen.findByText('Pyerite');
      await waitFor(() => expect(screen.getByTestId('location-search').textContent).toBe(''));
    });
  });

  describe('Columns', () => {
    const OPTIONAL = ['Your price', 'Station cheapest', 'Never sell below', 'Remaining', 'Expires'];

    async function openColumns(user: ReturnType<typeof userEvent.setup>) {
      fireEvent.pointerDown(await screen.findByRole('button', { name: 'Columns' }), {
        button: 0,
        pointerType: 'mouse',
      });
      await screen.findByRole('menu');
      void user;
    }

    it('lists the five optional columns, all off by default', async () => {
      const user = userEvent.setup();
      mockedLoadAll.mockResolvedValue(snapshot([entry([BELOW_FLOOR_ORDER])]));
      mockedCostBases.mockResolvedValue(new Map([[101, costBasis(600)]]));
      renderPanel();

      const table = await screen.findByRole('table', NEEDS_YOU_TABLE);
      for (const name of OPTIONAL) {
        expect(within(table).queryByRole('columnheader', { name })).not.toBeInTheDocument();
      }
      await openColumns(user);
      const items = screen.getAllByRole('menuitemcheckbox');
      expect(items.map((item) => item.textContent)).toEqual(OPTIONAL);
      for (const item of items) expect(item).toHaveAttribute('aria-checked', 'false');
    });

    it('turns one on between Do this and ISK tied up, keeps the pick, and Reset turns it off', async () => {
      const user = userEvent.setup();
      mockedLoadAll.mockResolvedValue(snapshot([entry([BELOW_FLOOR_ORDER])]));
      mockedCostBases.mockResolvedValue(new Map([[101, costBasis(600)]]));
      renderPanel();

      await screen.findByRole('table', NEEDS_YOU_TABLE);
      await openColumns(user);
      await user.click(screen.getByRole('menuitemcheckbox', { name: 'Your price' }));
      await user.keyboard('{Escape}');

      const headers = within(screen.getByRole('table', NEEDS_YOU_TABLE))
        .getAllByRole('columnheader')
        .map((th) => th.textContent?.trim());
      expect(headers.indexOf('Your price')).toBe(headers.indexOf('Do this') + 1);
      expect(headers.indexOf('ISK tied up')).toBe(headers.indexOf('Your price') + 1);
      expect(
        within(screen.getByRole('row', { name: /Tritanium/ })).getByText(formatMarketIsk(500))
      ).toBeInTheDocument();
      await waitFor(async () =>
        expect((await db.settings.get('openOrdersOptionalColumns'))?.value).toEqual(['price'])
      );

      await openColumns(user);
      await user.click(screen.getByRole('menuitem', { name: 'Reset to default' }));
      expect(
        within(screen.getByRole('table', NEEDS_YOU_TABLE)).queryByRole('columnheader', {
          name: 'Your price',
        })
      ).not.toBeInTheDocument();
    });

    it('drops a header sort once its column is hidden, back to worst first', async () => {
      const user = userEvent.setup();
      useVisibleOpenOrderColumns.setState({ value: ['price'], hydrated: true });
      mockedLoadAll.mockResolvedValue(snapshot([entry([BELOW_FLOOR_ORDER, EXPIRING_ORDER])]));
      mockedCostBases.mockResolvedValue(new Map([[101, costBasis(600)]]));
      renderPanel();

      const firstItem = () =>
        within(screen.getByRole('table', NEEDS_YOU_TABLE)).getAllByRole('row')[1].textContent;
      await screen.findByRole('table', NEEDS_YOU_TABLE);
      expect(firstItem()).toContain('Tritanium');
      await user.click(
        within(screen.getByRole('table', NEEDS_YOU_TABLE)).getByRole('button', {
          name: /^Your price/,
        })
      );
      expect(firstItem()).toContain('Mexallon');

      await openColumns(user);
      await user.click(screen.getByRole('menuitemcheckbox', { name: 'Your price' }));
      await user.keyboard('{Escape}');
      expect(firstItem()).toContain('Tritanium');
    });

    it('shows "—" for a floor nobody linked, and the floor rounded up to a legal price, in danger colour when the price is under it (issue #1421)', async () => {
      useVisibleOpenOrderColumns.setState({ value: ['floor'], hydrated: true });
      mockedLoadAll.mockResolvedValue(snapshot([entry([BELOW_FLOOR_ORDER, EXPIRING_ORDER])]));
      // unitCost 1000 (vs. BELOW_FLOOR_ORDER's 500 price) lands the exact
      // break-even ("relist") at a fractional, non-legal price.
      mockedCostBases.mockResolvedValue(new Map([[101, costBasis(1000)]]));

      renderPanel();

      const below = await screen.findByRole('row', { name: /Tritanium/ });
      const floor = orderFloor({
        unitCost: 1000,
        remainingQuantity: BELOW_FLOOR_ORDER.volume_remain,
        accountingLevel: 5,
        brokerRelationsLevel: 5,
        advancedBrokerRelationsLevel: 0,
      });
      if (!floor) throw new Error('expected a floor for this fixture');
      const rounded = roundPriceUp(floor.relist) ?? floor.relist;
      expect(formatMarketIsk(rounded)).not.toBe(formatMarketIsk(floor.relist));
      const cell = within(below).getByText(formatMarketIsk(rounded));
      expect(cell).toHaveClass('text-isk-neg');
      expect(within(below).queryByText(formatMarketIsk(floor.relist))).not.toBeInTheDocument();

      const expiring = screen.getByRole('row', { name: /Mexallon/ });
      expect(expiring.querySelector('td[data-label="Never sell below"]')).toHaveTextContent('—');
    });
  });

  it('opens the detail modal by clicking the row', async () => {
    const user = userEvent.setup();
    mockedLoadAll.mockResolvedValue(snapshot([entry([BELOW_FLOOR_ORDER])]));
    mockedCostBases.mockResolvedValue(new Map([[101, costBasis(600)]]));

    renderPanel();
    const row = await screen.findByRole('row', { name: /Tritanium/ });
    await user.click(within(row).getByText(/Tritanium|Pyerite|Mexallon/));

    const dialog = await screen.findByRole('dialog', { name: 'Tritanium' });
    expect(within(dialog).getByText('Put the price up')).toBeInTheDocument();
  });

  it('opens the detail modal when the item name is clicked, with the name not a link', async () => {
    const user = userEvent.setup();
    mockedLoadAll.mockResolvedValue(snapshot([entry([BELOW_FLOOR_ORDER])]));
    mockedCostBases.mockResolvedValue(new Map([[101, costBasis(600)]]));

    renderPanel();
    const row = await screen.findByRole('row', { name: /Tritanium/ });
    expect(within(row).queryByRole('link', { name: 'Tritanium' })).not.toBeInTheDocument();
    await user.click(within(row).getByText('Tritanium'));

    const dialog = await screen.findByRole('dialog', { name: 'Tritanium' });
    expect(within(dialog).getByRole('link', { name: 'View in Market' })).toBeInTheDocument();
  });

  it('fetches price history on opening a row\'s details and feeds it into the "sells out in" chip', async () => {
    // This is the wiring `loadPriceHistory` exists for (issue #5): if
    // `openDetails` stopped calling it, this test — not just the modal's own
    // prop-level tests — is what would catch a promised feature silently
    // regressing back to dead scaffolding.
    const user = userEvent.setup();
    mockedLoadAll.mockResolvedValue(snapshot([entry([BELOW_FLOOR_ORDER])]));
    mockedCostBases.mockResolvedValue(new Map([[101, costBasis(600)]]));
    loaders.priceHistory.mockResolvedValue({
      points: Array.from({ length: 3 }, (_, i) =>
        historyPoint({
          date: new Date(Date.now() - (i + 1) * 86_400_000).toISOString().slice(0, 10),
          average: 100,
          volume: 100,
        })
      ),
      fetchedAt: Date.now(),
    });

    renderPanel();
    const row = await screen.findByRole('row', { name: /Tritanium/ });
    await user.click(within(row).getByText(/Tritanium|Pyerite|Mexallon/));

    const dialog = await screen.findByRole('dialog', { name: 'Tritanium' });
    expect(loaders.priceHistory).toHaveBeenCalledWith(REGION, 34);
    // 300 units / 30 days = 10/day; BELOW_FLOOR_ORDER's volumeRemain is 10 ->
    // 1 day, with no deep book fetched yet so myShare defaults to 1.
    // The folded "The numbers" section's trailing read carries it.
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: /The numbers/ })).toHaveTextContent(
        'Sells out in 1 day'
      )
    );
  });

  it('shows an unchecked scope as unchecked rather than clean', async () => {
    const user = userEvent.setup();
    mockedLoadAll.mockResolvedValue(snapshot([entry([BELOW_FLOOR_ORDER])]));
    mockedCostBases.mockResolvedValue(new Map([[101, costBasis(600)]]));
    // The region book comes back with no orders at all — my own order can't
    // be found in it, so `system` cannot be resolved (must read as "not
    // checked"), while `region` was genuinely checked and found clean.
    loaders.regionCompetition.mockResolvedValue({
      competitors: [],
      fetchedAt: Date.now(),
      truncated: false,
    });

    renderPanel();
    const row = await screen.findByRole('row', { name: /Tritanium/ });
    await user.click(within(row).getByText(/Tritanium|Pyerite|Mexallon/));

    const dialog = await screen.findByRole('dialog', { name: 'Tritanium' });
    await waitFor(() => expect(within(dialog).queryByText('Checking…')).not.toBeInTheDocument());
    // "Who is cheaper" starts folded (issue #1428).
    fireEvent.click(within(dialog).getByRole('button', { name: /Who is cheaper/ }));

    const systemRow = within(dialog).getByText('System').closest('div');
    const regionRow = within(dialog).getByText('Region').closest('div');
    expect(systemRow).toHaveTextContent('Not checked yet');
    expect(regionRow).toHaveTextContent('Nobody cheaper here');
  });

  it('still renders rows when the NPC-station lookup itself fails to load (e.g. first offline visit)', async () => {
    // stations.json is deliberately outside the install precache, so it can
    // fail on a first offline visit — that must not take the whole loader
    // down with it (it used to, via an unguarded `Promise.all`).
    mockedNpcStations.mockRejectedValue(new Error('offline'));
    mockedLoadAll.mockResolvedValue(snapshot([entry([BELOW_FLOOR_ORDER])]));
    mockedCostBases.mockResolvedValue(new Map([[101, costBasis(600)]]));

    renderPanel();
    expect(await screen.findByRole('row', { name: /Tritanium/ })).toBeInTheDocument();
  });

  it("folds the notices into one quiet line at the list's foot, the cached notice above it", async () => {
    mockedLoadAll.mockResolvedValue(
      snapshot([entry([EXPIRING_ORDER], { fromCache: true })], [{ characterId: 2, name: 'Bravo' }])
    );

    renderPanel();

    const line = (await screen.findByText("Bravo hasn't shared their orders")).closest('p');
    const table = screen.getByRole('table', NEEDS_YOU_TABLE);
    expect(table.compareDocumentPosition(line!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The cached notice keeps its own line above the list, age included (DESIGN.md).
    const cached = screen.getByText(/Showing cached data/);
    expect(cached.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("names a Character left out of All on the picker, not in the list's foot", async () => {
    mockedLoadAll.mockResolvedValue(
      snapshot(
        [
          entry([EXPIRING_ORDER]),
          entry([{ ...EXPIRING_ORDER, order_id: 202 }], { characterId: 2, characterName: 'Bravo' }),
        ],
        [{ characterId: 3, name: 'Charlie' }]
      )
    );

    renderPanel();

    const picker = await within(screen.getByRole('banner')).findByRole('button', {
      name: 'All characters · 2. Not included: Charlie',
    });
    expect(picker).toHaveClass('md:h-9');
    expect(screen.queryByText("Charlie hasn't shared their orders")).not.toBeInTheDocument();
    // The faces are the two Characters with orders, the active one first (no "+N" from the roster).
    const faces = Array.from(picker.querySelectorAll('img')).map(
      (img) => /characters\/(\d+)\//.exec(img.getAttribute('src') ?? '')?.[1]
    );
    expect(faces).toEqual(['1', '2']);
    expect(picker.querySelector('[data-stack-extra]')).toBeNull();
  });

  describe('funnel filter controls', () => {
    /**
     * The controls live behind the funnel at every width on this page (the
     * chip-per-problem set is two full rows inline), so every filter test
     * has to open the box first.
     */
    async function openFunnel(user: ReturnType<typeof userEvent.setup>) {
      await user.click(await screen.findByRole('button', { name: /^Filters/ }));
    }

    function renderMixedFixture(initialEntry?: string) {
      mockedLoadAll.mockResolvedValue(
        snapshot([entry([BELOW_FLOOR_ORDER, EXPIRING_ORDER, NO_COST_BASIS_ORDER])])
      );
      mockedCostBases.mockResolvedValue(new Map([[101, costBasis(600)]]));
      return renderPanel(initialEntry);
    }

    it('narrows the list with a problem chip', async () => {
      const user = userEvent.setup();
      renderMixedFixture();
      // Needs you: belowFloor + expiringOrStale; the healthy order is Fine.
      expect(await screen.findByRole('button', { name: 'Needs you (2)' })).toBeInTheDocument();
      // A segment hiding the rest is not a failed match: nothing announced.
      expect(screen.queryByText(/orders match/)).not.toBeInTheDocument();

      await openFunnel(user);
      await user.click(screen.getByRole('button', { name: 'Priced below cost1' }));
      await findMatchCount('1 of 3 orders match');
      expect(screen.getByRole('button', { name: 'Needs you (1)' })).toBeInTheDocument();
    });

    it('keeps the whole control set behind the funnel until it is opened', async () => {
      const user = userEvent.setup();
      renderMixedFixture();
      await screen.findByRole('table', NEEDS_YOU_TABLE);

      expect(screen.queryByRole('combobox', { name: 'Expires within' })).not.toBeInTheDocument();
      await openFunnel(user);
      expect(screen.getByRole('combobox', { name: 'Expires within' })).toBeInTheDocument();
    });

    /*
     * The Overview board's count tiles link here already narrowed to what they
     * counted (`openOrdersHref`), so a tile reading "21 undercut" and a page
     * listing thirty cannot both be on screen. `openOrdersFilter.test.ts`
     * covers the parsing; these cover that the page actually opens on it.
     */
    it('opens narrowed to the problem the link names', async () => {
      renderMixedFixture('/market/orders?orders.problems=expiringOrStale');
      await findMatchCount('1 of 3 orders match');
    });

    describe('opened for a chosen Character (issue #2936)', () => {
      beforeEach(async () => {
        await db.characters.bulkPut([
          { characterId: 1, name: 'Alpha', ownerHash: 'a', addedAt: 1 },
          { characterId: 2, name: 'Bravo', ownerHash: 'b', addedAt: 2 },
        ]);
        await db.tokens.put({
          characterId: 2,
          accessToken: 't',
          refreshToken: 'r',
          expiresAt: Date.now() + 3_600_000,
          scopes: [],
        });
        mockedLoadAll.mockResolvedValue(
          snapshot([
            entry([BELOW_FLOOR_ORDER]),
            entry([EXPIRING_ORDER], { characterId: 2, characterName: 'Bravo' }),
          ])
        );
      });
      afterEach(async () => {
        await db.characters.clear();
        await db.tokens.clear();
      });

      it('shows only that Character, states whose data it is, and leaves the active one alone', async () => {
        renderPanel('/market/orders?char=2');
        expect(await screen.findByText('Bravo only')).toBeInTheDocument();
        expect(await screen.findByRole('row', { name: /Mexallon/ })).toBeInTheDocument();
        expect(screen.queryByText('Tritanium')).not.toBeInTheDocument();
        expect(useActiveCharacter.getState().activeCharacterId).toBe(1);
      });

      it('shows the grant note for a Character without the orders scope', async () => {
        mockedLoadAll.mockResolvedValue(snapshot([], [{ characterId: 2, name: 'Bravo' }]));
        renderPanel('/market/orders?char=2');
        expect(await screen.findByText('Bravo only')).toBeInTheDocument();
        expect(
          await screen.findByText('Bravo — Log in again to see your orders')
        ).toBeInTheDocument();
        expect(screen.queryByText(/No open orders/i)).not.toBeInTheDocument();
      });
    });

    it('opens narrowed to the character the link names', async () => {
      mockedLoadAll.mockResolvedValue(
        snapshot([
          entry([BELOW_FLOOR_ORDER, EXPIRING_ORDER]),
          entry([order({ order_id: 301, type_id: 36, price: 300, duration: 5 })], {
            characterId: 2,
            characterName: 'Beta',
          }),
        ])
      );
      mockedCostBases.mockResolvedValue(new Map([[101, costBasis(600)]]));
      renderPanel('/market/orders?orders.characters=1');

      await findMatchCount('2 of 3 orders match');
    });

    it('labels a link naming an alt other than the active Character "All characters", without widening the table it still narrows', async () => {
      mockedLoadAll.mockResolvedValue(
        snapshot([
          entry([BELOW_FLOOR_ORDER, EXPIRING_ORDER]),
          entry([order({ order_id: 301, type_id: 36, price: 300, duration: 5 })], {
            characterId: 2,
            characterName: 'Beta',
          }),
        ])
      );
      mockedCostBases.mockResolvedValue(new Map([[101, costBasis(600)]]));
      // The active Character (from `useActiveCharacter`) is Alpha (id 1); this
      // link names Beta (id 2) instead — the Overview board's own per-alt
      // Orders tile (`overview/cards.tsx`) links exactly this way on purpose,
      // to open narrowed to one alt's orders regardless of which Character
      // happens to be active. `CharacterFilterControl` can no longer express
      // "just Beta" (only "current" or "all"), so its label falls back to
      // "All characters" rather than lying that it's "This character"
      // (Alpha) — but the table must keep filtering to Beta's own orders
      // regardless, exactly as the tile that built this link intended.
      renderPanel('/market/orders?orders.characters=2');

      expect(await screen.findByRole('button', { name: 'All characters · 2' })).toBeInTheDocument();
      // Beta's own item (Mexallon, type 36) shows; Alpha's (Tritanium, type
      // 34) does not — the table stayed narrowed to Beta despite the label.
      expect(await screen.findByText('Mexallon')).toBeInTheDocument();
      expect(screen.queryByText('Tritanium')).not.toBeInTheDocument();
    });

    it('says a filter is narrowing on the funnel, with no chip row beside it', async () => {
      renderMixedFixture('/market/orders?orders.problems=expiringOrStale');
      await findMatchCount('1 of 3 orders match');

      // The funnel's count is what tells the reader why they see one order of three.
      expect(screen.getByRole('button', { name: 'Filters (1 active)' })).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /^Problem: Expiring or stale$/i })
      ).not.toBeInTheDocument();
    });

    it('opens on the segment the link names, and says when it is empty', async () => {
      renderMixedFixture('/market/orders?orders.view=watch');
      expect(await screen.findByRole('button', { name: 'Watch (0)' })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      expect(screen.getByText('Nothing to watch right now.')).toBeInTheDocument();
    });

    it('ignores a param it cannot read instead of showing an empty page', async () => {
      renderMixedFixture('/market/orders?orders.problems=nonsense&orders.view=nonsense');
      expect(await screen.findByRole('button', { name: 'Needs you (2)' })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
    });

    it('still renders a zero-count problem chip, at full contrast', async () => {
      const user = userEvent.setup();
      renderMixedFixture();
      await screen.findByRole('table', NEEDS_YOU_TABLE);
      await openFunnel(user);

      // Nothing in this fixture is undercut at the station tier. The `0`
      // itself is the cue — no opacity fade below AA (issue #1491).
      const chip = screen.getByRole('button', { name: /^Undercut at my station/ });
      expect(chip).toHaveTextContent('0');
      expect(chip.className).not.toContain('opacity-50');
    });

    it('narrows the list with the cost-basis chip pair', async () => {
      const user = userEvent.setup();
      renderMixedFixture();
      await screen.findByRole('table', NEEDS_YOU_TABLE);

      // The expiring and the healthy order have no cost basis.
      await openFunnel(user);
      await user.click(screen.getByRole('button', { name: 'No cost basis' }));
      await findMatchCount('2 of 3 orders match');
      expect(screen.getByRole('button', { name: 'Needs you (1)' })).toBeInTheDocument();
    });

    it('narrows the list with the "expires within" select', async () => {
      const user = userEvent.setup();
      renderMixedFixture();
      await screen.findByRole('table', NEEDS_YOU_TABLE);

      // The below-floor order expires in 60 days; only the expiring order (5
      // days left) is inside a 7-day window.
      await openFunnel(user);
      await user.click(screen.getByRole('combobox', { name: 'Expires within' }));
      await user.click(screen.getByRole('option', { name: '7 days' }));
      await findMatchCount('1 of 3 orders match');
    });

    it('narrows the list with the "ISK tied up over" select, down to an honest no-match', async () => {
      const user = userEvent.setup();
      renderMixedFixture();
      await screen.findByRole('table', NEEDS_YOU_TABLE);

      // Every order ties up well under 10M ISK.
      await openFunnel(user);
      await user.click(screen.getByRole('combobox', { name: 'ISK tied up over' }));
      await user.click(screen.getByRole('option', { name: '10M ISK' }));
      await findMatchCount('No orders match your filters.');
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });
  });
});

describe('OpenOrdersPanel — Corporation source', () => {
  const corpFeed = (orders: MarketOrder[], issuers: [number, string][]): CorpOrdersFeed => ({
    readable: true,
    needsReauth: false,
    fetchedAt: new Date(),
    fromCache: false,
    orders: orders.map((o, i) => ({ ...o, issued_by: issuers[i % issuers.length]![0] })),
    typeNames: TYPE_NAMES,
    stationNames: new Map([[STATION_A, 'Jita IV - Moon 4']]),
    // A rival sells below 500: the order is undercut at the station.
    stationPrices: new Map([
      [stationPriceKey(STATION_A, 34), { sellMin: 400, buyMax: 100, sellVolume: 5, buyVolume: 5 }],
    ]),
    issuerNames: new Map(issuers),
  });

  function renderCorp(callbacks: { onLeaveCorporation?: () => void } = {}) {
    return render(
      <MemoryRouter initialEntries={['/market/orders?scope=corp']}>
        <CurrentSearch />
        <FakeItemActions actions={actions}>
          {withOrderDetailLoaders(
            <WithPageHeaderSlots>
              {(slots) => (
                <OpenOrdersPanel
                  headerSlots={slots}
                  corporation
                  onChooseCorporation={() => {}}
                  {...callbacks}
                />
              )}
            </WithPageHeaderSlots>,
            loaders
          )}
        </FakeItemActions>
      </MemoryRouter>
    );
  }

  function headers(table: HTMLElement) {
    return within(table)
      .getAllByRole('columnheader')
      .map((h) => h.textContent);
  }

  it('draws the same columns, tabs and toolbar as the Character source', async () => {
    mockedLoadAll.mockResolvedValue(snapshot([entry([BELOW_FLOOR_ORDER])]));
    mockedCostBases.mockResolvedValue(new Map([[101, costBasis(600)]]));
    const first = renderPanel();
    const characterHeaders = headers(await screen.findByRole('table', NEEDS_YOU_TABLE));
    first.unmount();

    vi.mocked(loadCorpOrdersFeed).mockResolvedValue(corpFeed([BELOW_FLOOR_ORDER], [[7, 'Efa']]));
    renderCorp();
    const table = await screen.findByRole('table', NEEDS_YOU_TABLE);
    expect(headers(table)).toEqual(characterHeaders);
    expect(screen.getByRole('button', { name: /^Watch/ })).toBeInTheDocument();
    expect(screen.getByRole('searchbox')).toBeInTheDocument();
    // Undercut advice rests on market prices alone, so it reads the same.
    expect(within(table).getByRole('row', { name: /Tritanium/ })).toHaveTextContent(/undercut/i);
  });

  it('names the issuer where the Character source names the Character', async () => {
    vi.mocked(loadCorpOrdersFeed).mockResolvedValue(
      corpFeed(
        [BELOW_FLOOR_ORDER, EXPIRING_ORDER],
        [
          [7, 'Efa Astrahus'],
          [8, 'Bea Astrahus'],
        ]
      )
    );
    renderCorp();
    const table = await screen.findByRole('table', NEEDS_YOU_TABLE);
    expect(within(table).getByRole('row', { name: /Tritanium/ })).toHaveTextContent('Efa Astrahus');
    expect(within(table).getByRole('row', { name: /Mexallon/ })).toHaveTextContent('Bea Astrahus');
    // Never the Character read.
    expect(mockedLoadAll).not.toHaveBeenCalled();
  });

  it('goes straight to This character or All characters, with issuer rows shown whatever the Character pick', async () => {
    vi.mocked(loadCorpOrdersFeed).mockResolvedValue(corpFeed([BELOW_FLOOR_ORDER], [[7, 'Efa']]));
    const onLeaveCorporation = vi.fn();
    const user = userEvent.setup();
    await db.characters.bulkPut([
      { characterId: 1, name: 'Alpha' },
      { characterId: 2, name: 'Bravo' },
    ] as never);
    renderCorp({ onLeaveCorporation });
    // Issuer 7 is no Character on the device: its rows show whatever the pick.
    await screen.findByRole('table', NEEDS_YOU_TABLE);

    await user.click(
      within(screen.getByRole('banner')).getByRole('button', { name: 'Corporation' })
    );
    expect(screen.getByRole('menuitemradio', { name: 'Corporation' })).toBeChecked();
    await user.click(screen.getByRole('menuitemradio', { name: 'This character' }));
    expect(onLeaveCorporation).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('location-search')).toHaveTextContent('orders.characters=1');
    await db.characters.clear();
  });
});

describe('OpenOrdersPanel — phone', () => {
  const original = window.matchMedia;
  beforeEach(() => {
    // `useIsPhone` reads a max-width query; answering yes is how a phone looks under test.
    window.matchMedia = (media: string) =>
      ({
        media,
        matches: true,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList;
  });
  afterEach(() => {
    window.matchMedia = original;
  });

  it('renders two-line tap-to-open cards, not a table: item and badge, then what to do', async () => {
    mockedLoadAll.mockResolvedValue(snapshot([entry([BELOW_FLOOR_ORDER])]));
    mockedCostBases.mockResolvedValue(new Map([[101, costBasis(600)]]));

    renderPanel();

    const row = await screen.findByRole('button', { name: /^Tritanium/ });
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(row).toHaveTextContent('Below floor');
    expect(row).toHaveTextContent(/Put the price up: /);
    // Station and remaining live in the detail.
    expect(row).not.toHaveTextContent('Jita');
    expect(row).not.toHaveTextContent('10 / 10');
    // No column picker: the cards ignore it.
    expect(screen.queryByRole('button', { name: 'Columns' })).not.toBeInTheDocument();
  });

  it('opens the detail modal by tapping the row, same order as clicking a desktop row', async () => {
    const user = userEvent.setup();
    mockedLoadAll.mockResolvedValue(snapshot([entry([BELOW_FLOOR_ORDER])]));
    mockedCostBases.mockResolvedValue(new Map([[101, costBasis(600)]]));

    renderPanel();
    const row = await screen.findByRole('button', { name: /^Tritanium/ });
    await user.click(row);

    expect(await screen.findByRole('dialog', { name: 'Tritanium' })).toBeInTheDocument();
  });

  it('shows the price to type as plain text inside the card, never a nested copy button', async () => {
    // A cheap station rival beating my price, plus a cost basis: the call is
    // "Undercut to …", a copy button on desktop. Nested inside this card's own
    // `<button>` that would be invalid HTML and a focus/tap trap.
    mockedLoadAll.mockResolvedValue(snapshot([entry([{ ...BELOW_FLOOR_ORDER, price: 1000 }])]));
    mockedCostBases.mockResolvedValue(new Map([[101, costBasis(100)]]));
    mockedStationPrices.mockResolvedValue(
      new Map([
        [
          stationPriceKey(STATION_A, 34),
          { buyMax: null, sellMin: 900, sellVolume: 0, buyVolume: 0 },
        ],
      ])
    );

    renderPanel();
    const row = await screen.findByRole('button', { name: /^Tritanium/ });
    expect(row).toHaveTextContent(/Undercut to 899/);
    expect(within(row).queryByRole('button')).not.toBeInTheDocument();
    expect(row.querySelector('[tabindex]')).toBeNull();
  });
});
