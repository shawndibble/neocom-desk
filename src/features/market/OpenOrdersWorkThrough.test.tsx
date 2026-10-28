import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import { requiredScopesForEndpoints } from '@/esi/registry';
import { configureClipboard } from '@/lib/clipboard';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useCharacterFilterPicks } from '@/features/character/characterFilterPicks';
import { useDefaultCharacterFilter } from '@/features/character/defaultCharacterFilter';
import { loadTypeNames } from '@/features/character/typeNames';
import { loadNpcStations } from '@/sde/loadMarketSde';
import { loadCorrectedSkills, type CorrectedSkills } from '@/features/skills/correctedSkills';
import { openInEve, OPEN_IN_EVE_ENDPOINTS } from '@/features/openInEve/sendOpenInEve';
import type { MarketOrder } from '@/esi/endpoints';
import { OpenOrdersPanel } from './OpenOrdersPanel';
import { WithPageHeaderSlots } from './__fixtures__/pageHeaderSlots';
import { fakeItemActions, FakeItemActions } from './__fixtures__/itemActions';
import { fakeOrderDetailLoaders, withOrderDetailLoaders } from './__fixtures__/orderDetailLoaders';
import { loadAllCharactersOpenOrders, type CharacterOpenOrders } from './openOrdersData';
import { loadOrderCostBases } from './orderCostBasis';
import { loadRegionCompetition, loadStationBestPrices } from './orderCompetition';
import { stationPriceKey } from './stationPriceKey';
import { ORDERS_CACHE_MS } from './workThrough';

vi.mock('./openOrdersData', () => ({ loadAllCharactersOpenOrders: vi.fn() }));
vi.mock('./orderCostBasis', () => ({
  loadOrderCostBases: vi.fn(),
  loadWalletOrderCostBases: vi.fn(async () => ({ bases: new Map(), gaps: new Map() })),
}));
vi.mock('./orderCompetition', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./orderCompetition')>()),
  loadStationBestPrices: vi.fn(),
  loadRegionCompetition: vi.fn(),
}));
vi.mock('@/features/openInEve/sendOpenInEve', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/openInEve/sendOpenInEve')>()),
  openInEve: vi.fn(),
}));
vi.mock('@/features/character/typeNames', () => ({ loadTypeNames: vi.fn() }));
vi.mock('@/sde/loadMarketSde', () => ({ loadNpcStations: vi.fn() }));
vi.mock('@/features/skills/correctedSkills', () => ({ loadCorrectedSkills: vi.fn() }));

const REGION = 10000002;
const STATION = 60003760;

function order(
  fields: Pick<MarketOrder, 'order_id' | 'type_id' | 'price'> & Partial<MarketOrder>
): MarketOrder {
  return {
    region_id: REGION,
    location_id: STATION,
    is_buy_order: false,
    is_corporation: false,
    volume_remain: 10,
    volume_total: 10,
    issued: '2026-09-01T00:00:00Z',
    duration: 90,
    range: 'station',
    ...fields,
  };
}

/** Undercut at the station: Fuzzwork's cheapest seller (450) beats 500. */
const UNDERCUT = order({ order_id: 101, type_id: 34, price: 500 });
/** Expiring in days, nobody else at the station. */
const EXPIRING = order({
  order_id: 201,
  type_id: 36,
  price: 300,
  issued: new Date().toISOString(),
  duration: 5,
});

function entry(orders: MarketOrder[], fetchedAt = Date.now()): CharacterOpenOrders {
  return {
    characterId: 1,
    characterName: 'Alpha',
    orders,
    fetchedAt,
    fromCache: false,
    needsReauth: false,
  };
}

function renderPanel(initialEntry = '/market/orders') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <FakeItemActions actions={fakeItemActions()}>
        {withOrderDetailLoaders(
          <WithPageHeaderSlots>
            {(slots) => <OpenOrdersPanel headerSlots={slots} />}
          </WithPageHeaderSlots>,
          fakeOrderDetailLoaders()
        )}
      </FakeItemActions>
    </MemoryRouter>
  );
}

const copied = vi.fn<(text: string) => Promise<void>>(async () => {});

beforeEach(async () => {
  vi.clearAllMocks();
  configureClipboard(copied);
  useCharacterFilterPicks.setState({ value: {}, hydrated: false });
  useDefaultCharacterFilter.setState({ value: 'all', hydrated: true });
  useActiveCharacter.setState({ activeCharacterId: 1, hydrated: true });
  vi.mocked(loadTypeNames).mockResolvedValue(
    new Map([
      [34, 'Tritanium'],
      [36, 'Mexallon'],
    ])
  );
  vi.mocked(loadNpcStations).mockResolvedValue([
    { id: STATION, name: 'Jita IV - Moon 4', systemId: 30000142 },
  ]);
  vi.mocked(loadStationBestPrices).mockImplementation(
    async (requests) =>
      new Map(
        requests.flatMap(({ stationId, typeIds }) =>
          typeIds.map(
            (typeId) =>
              [
                stationPriceKey(stationId, typeId),
                {
                  sellMin: typeId === 34 ? 450 : null,
                  buyMax: null,
                  sellVolume: 0,
                  buyVolume: 0,
                },
              ] as const
          )
        )
      )
  );
  vi.mocked(loadOrderCostBases).mockResolvedValue(new Map());
  vi.mocked(loadCorrectedSkills).mockResolvedValue({
    trained: new Map(),
    effective: new Map(),
  } as unknown as CorrectedSkills);
  // Click time: a rival now sits at 449, the player's own order beside it.
  vi.mocked(loadRegionCompetition).mockImplementation(async (_regionId, typeId) => ({
    competitors:
      typeId === 34
        ? [
            {
              orderId: 900,
              price: 449,
              locationId: STATION,
              systemId: 1,
              volumeRemain: 5,
              isBuyOrder: false,
            },
            {
              orderId: 101,
              price: 500,
              locationId: STATION,
              systemId: 1,
              volumeRemain: 10,
              isBuyOrder: false,
            },
          ]
        : [],
    fetchedAt: Date.now(),
    truncated: false,
  }));
  vi.mocked(openInEve).mockResolvedValue({ ok: true });
  await db.tokens.clear();
  await db.tokens.put({
    characterId: 1,
    accessToken: 'a',
    refreshToken: 'r',
    expiresAt: Date.now() + 3_600_000,
    scopes: [...requiredScopesForEndpoints(OPEN_IN_EVE_ENDPOINTS)],
  });
});

afterEach(() => configureClipboard(null));

/** The headline's quiet line, which the work-through ends. */
function summaryLine() {
  return screen.getByText(/ISK tied up in them/).closest('p') as HTMLElement;
}

describe('Open Orders work through', () => {
  it('offers "Work through (N)" for the orders that need a fix', async () => {
    vi.mocked(loadAllCharactersOpenOrders).mockResolvedValue({
      entries: [entry([UNDERCUT, EXPIRING])],
      skipped: [],
    });
    renderPanel();
    expect(
      await within(await waitFor(summaryLine)).findByRole('button', { name: 'Work through (2)' })
    ).toBeInTheDocument();
  });

  it('walks the queue worst first: Next copies the click-time price, opens it in EVE as the owner and moves on', async () => {
    const user = userEvent.setup();
    vi.mocked(loadAllCharactersOpenOrders).mockResolvedValue({
      entries: [entry([EXPIRING, UNDERCUT])],
      skipped: [],
    });
    renderPanel();
    await user.click(await screen.findByRole('button', { name: 'Work through (2)' }));

    expect(within(summaryLine()).getByText('1 of 2')).toBeInTheDocument();
    const current = () => document.querySelector('[aria-current="true"]') as HTMLElement;
    await waitFor(() => expect(current()).toHaveAttribute('data-row-key', '101'));
    expect(await within(current()).findByText('New price 448.90')).toBeInTheDocument();

    await user.click(within(current()).getByRole('button', { name: 'Next' }));

    await waitFor(() => expect(current()).toHaveAttribute('data-row-key', '201'));
    expect(copied).toHaveBeenCalledWith('448.90');
    expect(openInEve).toHaveBeenCalledWith(1, { kind: 'marketDetails', id: 34 });
    expect(vi.mocked(loadRegionCompetition)).toHaveBeenCalledWith(REGION, 34);
    const passed = document.querySelector('[data-row-key="101"]') as HTMLElement;
    expect(within(passed).getByText('448.90 copied')).toBeInTheDocument();
    expect(within(passed).getByText('Sent')).toBeInTheDocument();
    expect(within(summaryLine()).getByText('2 of 2')).toBeInTheDocument();
    expect(
      await within(current()).findByText('No other order at this station')
    ).toBeInTheDocument();
  });

  it('Skip moves on without copying or opening anything, and Stop ends the walk', async () => {
    const user = userEvent.setup();
    vi.mocked(loadAllCharactersOpenOrders).mockResolvedValue({
      entries: [entry([UNDERCUT, EXPIRING])],
      skipped: [],
    });
    renderPanel();
    await user.click(await screen.findByRole('button', { name: 'Work through (2)' }));
    const current = () => document.querySelector('[aria-current="true"]') as HTMLElement;
    await waitFor(() => expect(current()).toHaveAttribute('data-row-key', '101'));

    await user.click(within(current()).getByRole('button', { name: 'Skip' }));
    await waitFor(() => expect(current()).toHaveAttribute('data-row-key', '201'));
    expect(copied).not.toHaveBeenCalled();
    expect(openInEve).not.toHaveBeenCalled();

    await user.click(within(summaryLine()).getByRole('button', { name: 'Stop' }));
    expect(document.querySelector('[aria-current="true"]')).toBeNull();
    expect(
      within(summaryLine()).getByRole('button', { name: 'Work through (2)' })
    ).toBeInTheDocument();
  });

  it('without the Open in EVE permission, Next copies and moves on only', async () => {
    const user = userEvent.setup();
    await db.tokens.clear();
    vi.mocked(loadAllCharactersOpenOrders).mockResolvedValue({
      entries: [entry([UNDERCUT, EXPIRING])],
      skipped: [],
    });
    renderPanel();
    await user.click(await screen.findByRole('button', { name: 'Work through (2)' }));
    const current = () => document.querySelector('[aria-current="true"]') as HTMLElement;
    await waitFor(() => expect(current()).toHaveAttribute('data-row-key', '101'));
    await user.click(within(current()).getByRole('button', { name: 'Next' }));

    await waitFor(() => expect(current()).toHaveAttribute('data-row-key', '201'));
    expect(copied).toHaveBeenCalledWith('448.90');
    expect(openInEve).not.toHaveBeenCalled();
    expect(screen.queryByText('Sent')).toBeNull();
  });

  it('marks a sent row "Not changed" once an orders read from after the press shows it untouched, and keeps it after Stop', async () => {
    const user = userEvent.setup();
    vi.mocked(loadAllCharactersOpenOrders).mockResolvedValue({
      entries: [entry([UNDERCUT, EXPIRING])],
      skipped: [],
    });
    renderPanel();
    await user.click(await screen.findByRole('button', { name: 'Work through (2)' }));
    const current = () => document.querySelector('[aria-current="true"]') as HTMLElement;
    await waitFor(() => expect(current()).toHaveAttribute('data-row-key', '101'));
    await user.click(within(current()).getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(current()).toHaveAttribute('data-row-key', '201'));
    await user.click(within(summaryLine()).getByRole('button', { name: 'Stop' }));

    const row = () => document.querySelector('[data-row-key="101"]') as HTMLElement;
    expect(within(row()).getByText('Sent')).toBeInTheDocument();
    vi.mocked(loadAllCharactersOpenOrders).mockResolvedValue({
      entries: [entry([UNDERCUT, EXPIRING], Date.now() + ORDERS_CACHE_MS + 1)],
      skipped: [],
    });
    await user.click(screen.getByRole('button', { name: /^Refresh orders/ }));
    expect(await within(row()).findByText('Not changed')).toBeInTheDocument();
  });

  it('warns what a below-floor order loses at the new price, with See exits', async () => {
    const user = userEvent.setup();
    vi.mocked(loadCorrectedSkills).mockResolvedValue({
      skillsResult: null,
      skillsNeedsReauth: false,
      queueResult: null,
      queueNeedsReauth: false,
      completedLevels: new Map(),
      trained: new Map([
        [16622, { level: 5, sp: 0 }],
        [3446, { level: 5, sp: 0 }],
      ]),
      effective: new Map([
        [16622, 5],
        [3446, 5],
      ]),
      completedSp: 0,
      totalSp: null,
      fetchedAt: null,
    });
    vi.mocked(loadOrderCostBases).mockResolvedValue(
      new Map([
        [101, { unitCost: 600, runId: 'run-1', runQuantity: 10, materialCost: 3000, jobFee: 1200 }],
      ])
    );
    vi.mocked(loadAllCharactersOpenOrders).mockResolvedValue({
      entries: [entry([UNDERCUT])],
      skipped: [],
    });
    renderPanel();
    await user.click(await screen.findByRole('button', { name: 'Work through (1)' }));
    const current = () => document.querySelector('[aria-current="true"]') as HTMLElement;
    await waitFor(() => expect(current()).toHaveAttribute('data-row-key', '101'));
    await waitFor(() =>
      expect(
        within(current()).getByRole('button', { name: 'See exits' }).parentElement
      ).toHaveTextContent(/^Loses .* at 448\.90See exits$/)
    );

    await user.click(within(current()).getByRole('button', { name: 'See exits' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('starts the queue on arrival from the Overview link', async () => {
    vi.mocked(loadAllCharactersOpenOrders).mockResolvedValue({
      entries: [entry([UNDERCUT, EXPIRING])],
      skipped: [],
    });
    renderPanel('/market/orders?orders.workThrough=1');
    await waitFor(() =>
      expect(document.querySelector('[aria-current="true"]')).toHaveAttribute('data-row-key', '101')
    );
    expect(within(summaryLine()).getByText('1 of 2')).toBeInTheDocument();
  });
});

describe('Open Orders work through — phone', () => {
  const original = window.matchMedia;
  beforeEach(() => {
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

  it('shows the new price large with Open in EVE · Next · Skip, and never copies', async () => {
    const user = userEvent.setup();
    vi.mocked(loadAllCharactersOpenOrders).mockResolvedValue({
      entries: [entry([UNDERCUT, EXPIRING])],
      skipped: [],
    });
    renderPanel();
    await user.click(await screen.findByRole('button', { name: 'Work through (2)' }));
    const current = () => document.querySelector('[aria-current="true"]') as HTMLElement;
    await waitFor(() => expect(current()).toHaveAttribute('data-row-key', '101'));
    expect(await within(current()).findByText('448.90')).toBeInTheDocument();

    await user.click(within(current()).getByRole('button', { name: 'Open in EVE' }));
    await waitFor(() =>
      expect(openInEve).toHaveBeenCalledWith(1, { kind: 'marketDetails', id: 34 })
    );
    await user.click(within(current()).getByRole('button', { name: 'Next' }));

    await waitFor(() => expect(current()).toHaveAttribute('data-row-key', '201'));
    expect(copied).not.toHaveBeenCalled();
    const passed = document.querySelector('[data-row-key="101"]') as HTMLElement;
    expect(within(passed).getByText('Sent')).toBeInTheDocument();
  });
});
