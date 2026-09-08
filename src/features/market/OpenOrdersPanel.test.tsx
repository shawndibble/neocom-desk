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

function renderPanel(initialEntry = '/market?section=orders') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
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
  });

  it('folds a group away from its own header, keeping the summary on screen', async () => {
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

    const header = await screen.findByRole('button', { name: 'Priced below cost · 1' });
    expect(header).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('table', { name: 'Priced below cost · 1' })).toBeInTheDocument();

    await user.click(header);
    expect(header).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('table', { name: 'Priced below cost · 1' })).not.toBeInTheDocument();
    // The header still answers what the group holds while it is folded.
    expect(screen.getByTestId('order-group-belowFloor')).toHaveTextContent('ISK listed');
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
    expect(group).toHaveTextContent('These lose money every time one sells');
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

  it('offers the CharacterFilterControl once more than one character has orders, and narrows the table on a pick', async () => {
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

    const user = userEvent.setup();
    renderPanel();

    await screen.findByTestId('order-group-belowFloor');
    // Defaults to "All characters" — the picker itself, not a chip per
    // character (issue #607's UI-space audit).
    const trigger = screen.getByRole('button', { name: 'All characters' });
    expect(trigger).toBeInTheDocument();

    await user.click(trigger);
    // The active Character (from `useActiveCharacter`) is Alpha (id 1).
    await user.click(screen.getByRole('menuitem', { name: 'This character' }));

    // Narrowed to Alpha's own order (Tritanium, type 34); Bravo's (Mexallon,
    // type 36) is gone. Both groups were on screen before the pick.
    expect(await screen.findByText('Tritanium')).toBeInTheDocument();
    expect(screen.queryByText('Mexallon')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'This character' })).toBeInTheDocument();
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

  it('shows the noCostBasis badge and drops the floor column when nothing has one', async () => {
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
    // Not one order here has a floor, so the whole column is dropped rather
    // than shown as a wall of dashes.
    expect(screen.queryByText('Never sell below')).not.toBeInTheDocument();
    expect(row.querySelector('td[data-label="Never sell below"]')).toBeNull();
  });

  it('keeps the floor column when at least one visible order has one', async () => {
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

    const belowFloorGroup = await screen.findByTestId('order-group-belowFloor');
    expect(within(belowFloorGroup).getByText('Never sell below')).toBeInTheDocument();
  });

  it('drops the floor column once a filter narrows the visible rows to ones with no floor, even though a filtered-out row still has one', async () => {
    const user = userEvent.setup();
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
    await screen.findByTestId('order-group-belowFloor');
    await user.click(screen.getByRole('button', { name: 'Show healthy orders' }));
    // Both groups' tables carry the column at this point.
    expect(screen.getAllByText('Never sell below').length).toBeGreaterThan(0);

    // Narrows the visible set to Pyerite (no floor) only — Tritanium (which
    // has one) is filtered out, not just folded.
    await user.type(screen.getByPlaceholderText('Search by item…'), 'Pyerite');

    await waitFor(() =>
      expect(screen.queryByTestId('order-group-belowFloor')).not.toBeInTheDocument()
    );
    expect(screen.queryByText('Never sell below')).not.toBeInTheDocument();
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

    expect(await screen.findByRole('dialog', { name: 'Alpha · Tritanium' })).toBeInTheDocument();
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

    const dialog = await screen.findByRole('dialog', { name: 'Alpha · Tritanium' });
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

    const dialog = await screen.findByRole('dialog', { name: 'Alpha · Tritanium' });
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

    function renderMixedFixture(initialEntry?: string) {
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
      return renderPanel(initialEntry);
    }

    it('narrows the list with a problem chip', async () => {
      const user = userEvent.setup();
      renderMixedFixture();
      // Default (hideHealthy on): belowFloor + expiringOrStale match, the
      // healthy no-cost-basis order is folded out of the count.
      expect(await screen.findByText('2 of 3 orders match')).toBeInTheDocument();

      // Anchored to the chip's own accessible name (label + count), not the
      // group header button, which carries the same words plus a separator.
      await openFunnel(user);
      await user.click(screen.getByRole('button', { name: 'Priced below cost1' }));
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

    /*
     * The Overview board's count tiles link here already narrowed to what they
     * counted (`openOrdersHref`), so a tile reading "21 undercut" and a page
     * listing thirty cannot both be on screen. `openOrdersFilter.test.ts`
     * covers the parsing; these cover that the page actually opens on it.
     */
    it('opens narrowed to the problem the link names', async () => {
      renderMixedFixture('/market?section=orders&problem=expiringOrStale');
      // One of the three, where the page's own default matches two.
      expect(await screen.findByText('1 of 3 orders match')).toBeInTheDocument();
    });

    it('opens narrowed to the character the link names', async () => {
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
          {
            characterId: 2,
            characterName: 'Beta',
            orders: [order({ order_id: 301, type_id: 36, price: 300, duration: 5 })],
            fetchedAt: Date.now(),
            fromCache: false,
            needsReauth: false,
          },
        ])
      );
      mockedCostBases.mockResolvedValue(new Map([[101, costBasis(600)]]));
      renderPanel('/market?section=orders&character=1');

      expect(await screen.findByText('2 of 3 orders match')).toBeInTheDocument();
    });

    it('keeps the filter it applied removable, rather than silently narrowing', async () => {
      const user = userEvent.setup();
      renderMixedFixture('/market?section=orders&problem=expiringOrStale');
      await screen.findByText('1 of 3 orders match');

      // The chip row is the only thing telling the reader why they are seeing
      // one order out of three, and the only way back to all of them.
      // "Problem: " is the chip's own prefix (`chipLabel`) — the group header
      // below carries the same words without it.
      await user.click(screen.getByRole('button', { name: /^Problem: Expiring or stale$/i }));
      expect(await screen.findByText('2 of 3 orders match')).toBeInTheDocument();
    });

    it('ignores a param it cannot read instead of showing an empty page', async () => {
      renderMixedFixture('/market?section=orders&problem=nonsense');
      expect(await screen.findByText('2 of 3 orders match')).toBeInTheDocument();
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

      await user.click(
        within(group).getByRole('button', { name: 'Refresh system & region prices' })
      );

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
      await screen.findByRole('dialog', { name: 'Alpha · Tritanium' });
      await user.click(screen.getByRole('button', { name: 'Close' }));
      expect(mockedRegionCompetition).toHaveBeenCalledTimes(1);

      const group = screen.getByTestId('order-group-belowFloor');
      await user.click(
        within(group).getByRole('button', { name: 'Refresh system & region prices' })
      );
      // Still in flight from opening the row's own detail view — the group
      // check must not fire a second request for the same item.
      expect(mockedRegionCompetition).toHaveBeenCalledTimes(1);
    });
  });
});
