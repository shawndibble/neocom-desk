import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { OpenOrdersPanel } from './OpenOrdersPanel';
import { loadAllCharactersOpenOrders, type OpenOrdersSnapshot } from './openOrdersData';
import { loadOrderCostBases, type OrderCostBasis } from './orderCostBasis';
import { loadStationBestPrices, loadRegionCompetition, loadJumpsBetween } from './orderCompetition';
import { loadPriceHistory } from './priceHistory';
import { loadTypeNames } from '@/features/character/typeNames';
import { loadNpcStations } from '@/sde/loadMarketSde';
import { loadCorrectedSkills, type CorrectedSkills } from '@/features/skills/correctedSkills';
import { ESI_FANOUT_CONCURRENCY } from '@/lib/concurrency';
import type { MarketOrder } from '@/esi/endpoints';

vi.mock('./openOrdersData', () => ({ loadAllCharactersOpenOrders: vi.fn() }));
vi.mock('./orderCostBasis', () => ({ loadOrderCostBases: vi.fn() }));
vi.mock('./orderCompetition', () => ({
  loadStationBestPrices: vi.fn(),
  loadRegionCompetition: vi.fn(),
  loadJumpsBetween: vi.fn(),
}));
vi.mock('./priceHistory', () => ({ loadPriceHistory: vi.fn() }));
vi.mock('@/features/character/typeNames', () => ({ loadTypeNames: vi.fn() }));
vi.mock('@/sde/loadMarketSde', () => ({ loadNpcStations: vi.fn() }));
vi.mock('@/features/skills/correctedSkills', () => ({ loadCorrectedSkills: vi.fn() }));
vi.mock('@/lib/downloadCsv', () => ({ downloadCsv: vi.fn() }));
vi.mock('@/app/loginFlow', () => ({ beginEveLogin: vi.fn() }));

const mockedLoadAll = vi.mocked(loadAllCharactersOpenOrders);
const mockedCostBases = vi.mocked(loadOrderCostBases);
const mockedStationPrices = vi.mocked(loadStationBestPrices);
const mockedRegionCompetition = vi.mocked(loadRegionCompetition);
const mockedJumps = vi.mocked(loadJumpsBetween);
const mockedPriceHistory = vi.mocked(loadPriceHistory);
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
    completedSp: 0,
    totalSp: null,
    fetchedAt: null,
  };
}

function costBasis(unitCost: number): OrderCostBasis {
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

function renderPanel() {
  return render(
    <MemoryRouter>
      <OpenOrdersPanel />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useActiveCharacter.setState({ activeCharacterId: 1, hydrated: true });
  mockedTypeNames.mockResolvedValue(TYPE_NAMES);
  mockedNpcStations.mockResolvedValue([
    { id: STATION_A, name: 'Jita IV - Moon 4', systemId: 30000142 },
  ]);
  mockedStationPrices.mockResolvedValue(new Map());
  mockedCostBases.mockResolvedValue(new Map());
  mockedSkills.mockResolvedValue(
    skillsFixture([
      [16622, 5],
      [3446, 5],
    ])
  );
  // Deep checks (and price history, for the "sells out in" chip) are
  // on-demand only — default to "never resolves" so a test that doesn't
  // care about either tier never has to wait on them.
  mockedRegionCompetition.mockImplementation(() => new Promise(() => {}));
  mockedPriceHistory.mockImplementation(() => new Promise(() => {}));
  mockedJumps.mockResolvedValue({ kind: 'unknown', reason: 'noRoute' });
});

describe('OpenOrdersPanel', () => {
  it('renders groups worst-first, each with its row count', async () => {
    mockedLoadAll.mockResolvedValue(
      snapshot([
        {
          characterId: 1,
          characterName: 'Alpha',
          orders: [BELOW_FLOOR_ORDER, EXPIRING_ORDER],
          fetchedAt: Date.now(),
          fromCache: false,
          needsReauth: false,
        },
      ])
    );
    mockedCostBases.mockResolvedValue(new Map([[101, costBasis(600)]]));

    renderPanel();

    const belowFloorGroup = await screen.findByTestId('order-group-belowFloor');
    const expiringGroup = screen.getByTestId('order-group-expiringOrStale');

    expect(belowFloorGroup).toHaveTextContent('· 1');
    expect(expiringGroup).toHaveTextContent('· 1');
    // Worst-first: belowFloor precedes expiringOrStale in document order.
    expect(
      belowFloorGroup.compareDocumentPosition(expiringGroup) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    // Healthy hasn't appeared — nothing here is healthy in this fixture, but confirms no stray group renders.
    expect(screen.queryByTestId('order-group-healthy')).not.toBeInTheDocument();
  });

  it('states what is happening on the row, not just the badge', async () => {
    mockedLoadAll.mockResolvedValue(
      snapshot([
        {
          characterId: 1,
          characterName: 'Alpha',
          orders: [BELOW_FLOOR_ORDER, NO_COST_BASIS_ORDER],
          fetchedAt: Date.now(),
          fromCache: false,
          needsReauth: false,
        },
      ])
    );
    mockedCostBases.mockResolvedValue(new Map([[101, costBasis(600)]]));

    renderPanel();

    // The below-floor row says the loss in ISK a unit, not only "-x%".
    const belowFloorGroup = await screen.findByTestId('order-group-belowFloor');
    expect(belowFloorGroup).toHaveTextContent(/Selling at this price loses .* a unit/);
    // And its item cell names the run the floor came from.
    expect(belowFloorGroup).toHaveTextContent('Run run-1');

    // The order with nothing linked says so where the empty floor column is.
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Show healthy orders' }));
    expect(screen.getByTestId('order-group-healthy')).toHaveTextContent('No build linked');
  });

  it('summarises each group in its own header', async () => {
    mockedLoadAll.mockResolvedValue(
      snapshot([
        {
          characterId: 1,
          characterName: 'Alpha',
          orders: [BELOW_FLOOR_ORDER],
          fetchedAt: Date.now(),
          fromCache: false,
          needsReauth: false,
        },
      ])
    );
    mockedCostBases.mockResolvedValue(new Map([[101, costBasis(600)]]));

    renderPanel();

    const group = await screen.findByTestId('order-group-belowFloor');
    // What the group means, on screen rather than inside a tooltip...
    expect(group).toHaveTextContent('These orders lose ISK if they sell');
    // ...and what it is holding: 500 x 10 units.
    expect(group).toHaveTextContent('ISK listed');
  });

  it('marks an order that is not at a trade hub', async () => {
    // Not one of the five NPC trade hub stations in `@/market/hubs`.
    const OFF_HUB_STATION = 60011867;
    mockedNpcStations.mockResolvedValue([
      { id: STATION_A, name: 'Jita IV - Moon 4', systemId: 30000142 },
      { id: OFF_HUB_STATION, name: 'Osmon II - Moon 1', systemId: 30000049 },
    ]);
    mockedLoadAll.mockResolvedValue(
      snapshot([
        {
          characterId: 1,
          characterName: 'Alpha',
          orders: [{ ...BELOW_FLOOR_ORDER, location_id: OFF_HUB_STATION }],
          fetchedAt: Date.now(),
          fromCache: false,
          needsReauth: false,
        },
      ])
    );
    mockedCostBases.mockResolvedValue(new Map([[101, costBasis(600)]]));

    renderPanel();

    expect(await screen.findByTestId('order-group-belowFloor')).toHaveTextContent('Off hub');
  });

  it('has no character strip and no per-row character marker with one character', async () => {
    mockedLoadAll.mockResolvedValue(
      snapshot([
        {
          characterId: 1,
          characterName: 'Alpha',
          orders: [BELOW_FLOOR_ORDER],
          fetchedAt: Date.now(),
          fromCache: false,
          needsReauth: false,
        },
      ])
    );
    mockedCostBases.mockResolvedValue(new Map([[101, costBasis(600)]]));

    renderPanel();

    await screen.findByTestId('order-group-belowFloor');
    expect(screen.queryByText('All characters')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Alpha/ })).not.toBeInTheDocument();
  });

  it('shows a character strip with needs-attention counts once more than one character has orders', async () => {
    mockedLoadAll.mockResolvedValue(
      snapshot([
        {
          characterId: 1,
          characterName: 'Alpha',
          orders: [BELOW_FLOOR_ORDER],
          fetchedAt: Date.now(),
          fromCache: false,
          needsReauth: false,
        },
        {
          characterId: 2,
          characterName: 'Bravo',
          orders: [EXPIRING_ORDER],
          fetchedAt: Date.now(),
          fromCache: false,
          needsReauth: false,
        },
      ])
    );
    mockedCostBases.mockImplementation(async (characterId: number) =>
      characterId === 1 ? new Map([[101, costBasis(600)]]) : new Map()
    );

    renderPanel();

    await screen.findByTestId('order-group-belowFloor');
    expect(screen.getByText('All characters')).toBeInTheDocument();
    const alphaChip = screen.getByRole('button', { name: /Alpha/ });
    const bravoChip = screen.getByRole('button', { name: /Bravo/ });
    expect(alphaChip).toHaveTextContent('1');
    expect(bravoChip).toHaveTextContent('1');
  });

  it('folds the healthy group (header and count, no table) until "Show healthy orders" is pressed', async () => {
    const user = userEvent.setup();
    mockedLoadAll.mockResolvedValue(
      snapshot([
        {
          characterId: 1,
          characterName: 'Alpha',
          orders: [NO_COST_BASIS_ORDER],
          fetchedAt: Date.now(),
          fromCache: false,
          needsReauth: false,
        },
      ])
    );

    renderPanel();

    const group = await screen.findByTestId('order-group-healthy');
    // Folded, not filtered out: the heading and count still show...
    expect(group).toHaveTextContent('Healthy');
    expect(group).toHaveTextContent('· 1');
    // ...but no row is actually listed.
    expect(within(group).queryByRole('table')).not.toBeInTheDocument();
    expect(within(group).queryByText('Pyerite')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show healthy orders' }));
    expect(
      within(await screen.findByTestId('order-group-healthy')).getByRole('table')
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('order-group-healthy')).getByText('Pyerite')
    ).toBeInTheDocument();
  });

  it('shows the noCostBasis badge and no floor number for a sell order with nothing linked', async () => {
    const user = userEvent.setup();
    mockedLoadAll.mockResolvedValue(
      snapshot([
        {
          characterId: 1,
          characterName: 'Alpha',
          orders: [NO_COST_BASIS_ORDER],
          fetchedAt: Date.now(),
          fromCache: false,
          needsReauth: false,
        },
      ])
    );

    renderPanel();
    await waitFor(() => expect(mockedLoadAll).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: 'Show healthy orders' }));

    const group = await screen.findByTestId('order-group-healthy');
    const row = within(group).getByRole('row', { name: /Pyerite/ });
    expect(within(row).getByText('No cost basis')).toBeInTheDocument();
    // Floor column reads the shared "unknown" dash, never a zero.
    const floorCell = row.querySelector('td[data-label="Never sell below"]');
    expect(floorCell).toHaveTextContent('—');
  });

  it("opens the detail modal from a row's Details button", async () => {
    const user = userEvent.setup();
    mockedLoadAll.mockResolvedValue(
      snapshot([
        {
          characterId: 1,
          characterName: 'Alpha',
          orders: [BELOW_FLOOR_ORDER],
          fetchedAt: Date.now(),
          fromCache: false,
          needsReauth: false,
        },
      ])
    );
    mockedCostBases.mockResolvedValue(new Map([[101, costBasis(600)]]));

    renderPanel();
    const row = await screen.findByRole('row', { name: /Tritanium/ });
    await user.click(within(row).getByRole('button', { name: 'Details' }));

    expect(await screen.findByRole('dialog', { name: 'Tritanium' })).toBeInTheDocument();
    expect(screen.getByText('Quick answer')).toBeInTheDocument();
  });

  it('fetches price history on opening a row\'s details and feeds it into the "sells out in" chip', async () => {
    // This is the wiring `loadPriceHistory` exists for (issue #5): if
    // `openDetails` stopped calling it, this test — not just the modal's own
    // prop-level tests — is what would catch a promised feature silently
    // regressing back to dead scaffolding.
    const user = userEvent.setup();
    mockedLoadAll.mockResolvedValue(
      snapshot([
        {
          characterId: 1,
          characterName: 'Alpha',
          orders: [BELOW_FLOOR_ORDER],
          fetchedAt: Date.now(),
          fromCache: false,
          needsReauth: false,
        },
      ])
    );
    mockedCostBases.mockResolvedValue(new Map([[101, costBasis(600)]]));
    mockedPriceHistory.mockResolvedValue({
      points: Array.from({ length: 3 }, (_, i) => ({
        date: new Date(Date.now() - (i + 1) * 86_400_000).toISOString().slice(0, 10),
        average: 100,
        volume: 100,
      })),
      fetchedAt: Date.now(),
    });

    renderPanel();
    const row = await screen.findByRole('row', { name: /Tritanium/ });
    await user.click(within(row).getByRole('button', { name: 'Details' }));

    const dialog = await screen.findByRole('dialog', { name: 'Tritanium' });
    expect(mockedPriceHistory).toHaveBeenCalledWith(REGION, 34);
    // 300 units / 30 days = 10/day; BELOW_FLOOR_ORDER's volumeRemain is 10 ->
    // 1 day, with no deep book fetched yet so myShare defaults to 1.
    await waitFor(() => expect(within(dialog).getByText('1d')).toBeInTheDocument());
  });

  it('shows an unchecked scope as unchecked rather than clean', async () => {
    const user = userEvent.setup();
    mockedLoadAll.mockResolvedValue(
      snapshot([
        {
          characterId: 1,
          characterName: 'Alpha',
          orders: [BELOW_FLOOR_ORDER],
          fetchedAt: Date.now(),
          fromCache: false,
          needsReauth: false,
        },
      ])
    );
    mockedCostBases.mockResolvedValue(new Map([[101, costBasis(600)]]));
    // The region book comes back with no orders at all — my own order can't
    // be found in it, so `system` cannot be resolved (must read as "not
    // checked"), while `region` was genuinely checked and found clean.
    mockedRegionCompetition.mockResolvedValue({
      competitors: [],
      fetchedAt: Date.now(),
      truncated: false,
    });

    renderPanel();
    const row = await screen.findByRole('row', { name: /Tritanium/ });
    await user.click(within(row).getByRole('button', { name: 'Details' }));

    const dialog = await screen.findByRole('dialog', { name: 'Tritanium' });
    await waitFor(() => expect(within(dialog).queryByText('Checking...')).not.toBeInTheDocument());

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
    mockedLoadAll.mockResolvedValue(
      snapshot([
        {
          characterId: 1,
          characterName: 'Alpha',
          orders: [BELOW_FLOOR_ORDER],
          fetchedAt: Date.now(),
          fromCache: false,
          needsReauth: false,
        },
      ])
    );
    mockedCostBases.mockResolvedValue(new Map([[101, costBasis(600)]]));

    renderPanel();
    expect(await screen.findByRole('row', { name: /Tritanium/ })).toBeInTheDocument();
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

    function renderMixedFixture() {
      mockedLoadAll.mockResolvedValue(
        snapshot([
          {
            characterId: 1,
            characterName: 'Alpha',
            orders: [BELOW_FLOOR_ORDER, EXPIRING_ORDER, NO_COST_BASIS_ORDER],
            fetchedAt: Date.now(),
            fromCache: false,
            needsReauth: false,
          },
        ])
      );
      mockedCostBases.mockResolvedValue(new Map([[101, costBasis(600)]]));
      return renderPanel();
    }

    it('narrows the list with a problem chip', async () => {
      const user = userEvent.setup();
      renderMixedFixture();
      // Default (hideHealthy on): belowFloor + expiringOrStale match, the
      // healthy no-cost-basis order is folded out of the count.
      expect(await screen.findByText('2 of 3 orders match')).toBeInTheDocument();

      // Anchored so it doesn't also match the group heading's "About Priced
      // under my floor" InfoTooltip trigger.
      await openFunnel(user);
      await user.click(screen.getByRole('button', { name: /^Priced under my floor/ }));
      expect(await screen.findByText('1 of 3 orders match')).toBeInTheDocument();
    });

    it('keeps the whole control set behind the funnel until it is opened', async () => {
      const user = userEvent.setup();
      renderMixedFixture();
      await screen.findByText('2 of 3 orders match');

      expect(screen.queryByRole('combobox', { name: 'Expires within' })).not.toBeInTheDocument();
      await openFunnel(user);
      expect(screen.getByRole('combobox', { name: 'Expires within' })).toBeInTheDocument();
    });

    it('still renders a zero-count problem chip, dimmed', async () => {
      const user = userEvent.setup();
      renderMixedFixture();
      await screen.findByText('2 of 3 orders match');
      await openFunnel(user);

      // Nothing in this fixture is undercut at the station tier.
      const chip = screen.getByRole('button', { name: /^Undercut at my station/ });
      expect(chip).toHaveTextContent('0');
      expect(chip.className).toContain('opacity-50');
    });

    it('narrows the list with the cost-basis chip pair', async () => {
      const user = userEvent.setup();
      renderMixedFixture();
      await screen.findByText('2 of 3 orders match');

      // Only the expiring order (visible by default) has no cost basis linked.
      await openFunnel(user);
      await user.click(screen.getByRole('button', { name: 'No cost basis' }));
      expect(await screen.findByText('1 of 3 orders match')).toBeInTheDocument();
    });

    it('narrows the list with the "expires within" select', async () => {
      const user = userEvent.setup();
      renderMixedFixture();
      await screen.findByText('2 of 3 orders match');

      // The below-floor order expires in 60 days; only the expiring order (5
      // days left) is inside a 7-day window.
      await openFunnel(user);
      await user.click(screen.getByRole('combobox', { name: 'Expires within' }));
      await user.click(screen.getByRole('option', { name: '7 days' }));
      expect(await screen.findByText('1 of 3 orders match')).toBeInTheDocument();
    });

    it('narrows the list with the "ISK tied up over" select', async () => {
      const user = userEvent.setup();
      renderMixedFixture();
      await screen.findByText('2 of 3 orders match');

      // Both visible orders tie up well under 10M ISK.
      await openFunnel(user);
      await user.click(screen.getByRole('combobox', { name: 'ISK tied up over' }));
      await user.click(screen.getByRole('option', { name: '10M ISK' }));
      expect(await screen.findByText('0 of 3 orders match')).toBeInTheDocument();
    });
  });

  describe('"check system and region" for a whole group', () => {
    it('caps the region-book fan-out at ESI_FANOUT_CONCURRENCY distinct items, never firing every item at once', async () => {
      const user = userEvent.setup();
      // More distinct items than the concurrency cap, all in one
      // never-folded group (each expires in 5 days -> expiringOrStale).
      const itemCount = ESI_FANOUT_CONCURRENCY + 4;
      const orders = Array.from({ length: itemCount }, (_, i) =>
        order({
          order_id: 900 + i,
          type_id: 900 + i,
          price: 100,
          issued: new Date().toISOString(),
          duration: 5,
          volume_remain: 1,
          volume_total: 1,
        })
      );
      mockedLoadAll.mockResolvedValue(
        snapshot([
          {
            characterId: 1,
            characterName: 'Alpha',
            orders,
            fetchedAt: Date.now(),
            fromCache: false,
            needsReauth: false,
          },
        ])
      );
      mockedCostBases.mockResolvedValue(new Map());
      // Never resolves, so the in-flight call count is directly observable.
      mockedRegionCompetition.mockImplementation(() => new Promise(() => {}));

      renderPanel();
      const group = await screen.findByTestId('order-group-expiringOrStale');
      expect(group).toHaveTextContent(`· ${itemCount}`);

      await user.click(within(group).getByRole('button', { name: 'Check system and region' }));

      expect(mockedRegionCompetition).toHaveBeenCalledTimes(ESI_FANOUT_CONCURRENCY);
    });

    it('does not double-fetch an item already checked from its own row', async () => {
      const user = userEvent.setup();
      mockedLoadAll.mockResolvedValue(
        snapshot([
          {
            characterId: 1,
            characterName: 'Alpha',
            orders: [BELOW_FLOOR_ORDER],
            fetchedAt: Date.now(),
            fromCache: false,
            needsReauth: false,
          },
        ])
      );
      mockedCostBases.mockResolvedValue(new Map([[101, costBasis(600)]]));
      mockedRegionCompetition.mockImplementation(() => new Promise(() => {}));

      renderPanel();
      const row = await screen.findByRole('row', { name: /Tritanium/ });
      await user.click(within(row).getByRole('button', { name: 'Details' }));
      await screen.findByRole('dialog', { name: 'Tritanium' });
      await user.click(screen.getByRole('button', { name: 'Close' }));
      expect(mockedRegionCompetition).toHaveBeenCalledTimes(1);

      const group = screen.getByTestId('order-group-belowFloor');
      await user.click(within(group).getByRole('button', { name: 'Check system and region' }));
      // Still in flight from opening the row's own detail view — the group
      // check must not fire a second request for the same item.
      expect(mockedRegionCompetition).toHaveBeenCalledTimes(1);
    });
  });
});
