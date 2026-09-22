import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import type { BpcContractRow } from '@/engine/contracts/bpcSearch';
import type { LoyaltyStoreOffer, RegionOrder } from '@/esi/endpoints';
import { findLpOfferMatches, type LpOfferMatch } from '@/features/market/appraisalLpAcquisition';
import { getOrderBook } from '@/features/market/orderBook';
import { loadGlobalMarkets } from '@/sde/loadMarketSde';
import { loadPublicBpcContracts } from '@/features/bpcContracts/syncedContracts';
import { DEFAULT_LP_VALUE, useLpValue } from '@/features/loyalty/lpValue';
import { BlueprintAcquisitionModal, type AcquisitionOwnedCopy } from './BlueprintAcquisitionModal';

vi.mock('@/features/market/appraisalLpAcquisition', () => ({ findLpOfferMatches: vi.fn() }));
vi.mock('@/features/market/orderBook', () => ({ getOrderBook: vi.fn() }));
vi.mock('@/sde/loadMarketSde', () => ({ loadGlobalMarkets: vi.fn() }));
vi.mock('@/features/bpcContracts/syncedContracts', () => ({ loadPublicBpcContracts: vi.fn() }));
vi.mock('@/features/bpcContracts/blueprintLocation', () => ({
  loadContractLocationInfo: vi.fn(async (id: number) => ({
    name: STATION_NAMES[id] ?? null,
    space: null,
  })),
}));
vi.mock('@/features/bpcContracts/regionNames', () => ({
  loadRegionName: vi.fn(async (id: number) => REGION_NAMES[id] ?? null),
}));

const JITA_44 = 60003760;
const PERIMETER = 60000001;
const AMARR_STATION = 60008494;
const THE_FORGE = 10000002;
const DOMAIN = 10000043;
const STATION_NAMES: Record<number, string> = {
  [JITA_44]: 'Jita IV - Moon 4',
  [PERIMETER]: 'Perimeter II',
  [AMARR_STATION]: 'Amarr VIII',
};
const REGION_NAMES: Record<number, string> = { [THE_FORGE]: 'The Forge', [DOMAIN]: 'Domain' };

const mockedFindLpOfferMatches = vi.mocked(findLpOfferMatches);
const mockedGetOrderBook = vi.mocked(getOrderBook);
const mockedLoadGlobalMarkets = vi.mocked(loadGlobalMarkets);
const mockedLoadContracts = vi.mocked(loadPublicBpcContracts);

const ASTERO_BP = 33468;

const ASTERO_BPC_OFFER: LoyaltyStoreOffer = {
  offer_id: 1,
  type_id: ASTERO_BP,
  quantity: 1,
  isk_cost: 12_000_000,
  lp_cost: 950_000,
  required_items: [],
};

function lpMatch(overrides: Partial<LpOfferMatch> = {}): LpOfferMatch {
  return {
    corporationId: 1000125,
    corpName: 'Sisters of EVE',
    offer: ASTERO_BPC_OFFER,
    playerLp: 1_000_000,
    ...overrides,
  };
}

function lpResult(matches: LpOfferMatch[]) {
  return {
    matchesByTypeId: new Map(matches.length ? [[ASTERO_BP, matches]] : []),
    requiredItemTypeIds: [],
  };
}

function contract(overrides: Partial<BpcContractRow> = {}): BpcContractRow {
  return {
    contractId: 1,
    regionId: THE_FORGE,
    locationId: JITA_44,
    typeId: ASTERO_BP,
    price: 30_000_000,
    isAuction: false,
    me: 10,
    te: 20,
    runs: 10,
    quantity: 1,
    dateExpired: 0,
    isMultiType: false,
    ...overrides,
  };
}

function snapshot(copies: BpcContractRow[], originals: BpcContractRow[] = []) {
  return {
    data: { rows: copies, originals, lastSyncedAt: 0 },
    fromCache: false,
    fetchedAt: 0,
  } as unknown as Awaited<ReturnType<typeof loadPublicBpcContracts>>;
}

function sellOrder(overrides: Partial<RegionOrder> = {}): RegionOrder {
  return {
    duration: 365,
    is_buy_order: false,
    issued: '2026-09-01T00:00:00Z',
    location_id: JITA_44,
    min_volume: 1,
    order_id: 1,
    price: 5_000_000,
    range: 'region',
    system_id: 30000142,
    type_id: ASTERO_BP,
    volume_remain: 3,
    volume_total: 3,
    ...overrides,
  };
}

function orderBook(orders: RegionOrder[]) {
  return { orders, truncated: false, fetchedAt: 0 };
}

beforeEach(async () => {
  await db.settings.clear();
  useLpValue.setState({ value: DEFAULT_LP_VALUE, hydrated: false });
  mockedFindLpOfferMatches.mockResolvedValue(lpResult([]));
  mockedGetOrderBook.mockResolvedValue(orderBook([]));
  mockedLoadGlobalMarkets.mockResolvedValue([]);
  mockedLoadContracts.mockResolvedValue(snapshot([]));
});

afterEach(() => vi.clearAllMocks());

function renderModal(
  overrides: Partial<React.ComponentProps<typeof BlueprintAcquisitionModal>> = {}
) {
  const props: React.ComponentProps<typeof BlueprintAcquisitionModal> = {
    onClose: vi.fn(),
    characterId: 1,
    blueprintTypeID: ASTERO_BP,
    blueprintName: 'Astero Blueprint',
    ownedCopies: [] as readonly AcquisitionOwnedCopy[],
    sourcing: undefined,
    onSourcingChange: vi.fn(),
    onSearchBpcSourcing: vi.fn(),
    planHubId: 'jita',
    ...overrides,
  };
  render(
    <MemoryRouter>
      <BlueprintAcquisitionModal {...props} />
    </MemoryRouter>
  );
  return props;
}

function section(heading: string): HTMLElement {
  return screen.getByRole('heading', { name: heading }).closest('section')!;
}

describe('BlueprintAcquisitionModal — Owned', () => {
  it('forces an owned tier with no price, then closes', async () => {
    const user = userEvent.setup();
    const props = renderModal({ ownedCopies: [{ me: 8, te: 16, runs: 5 }] });
    await user.click(screen.getByRole('button', { name: /Use this blueprint: ME 8% \/ TE 16%/ }));
    expect(props.onSourcingChange).toHaveBeenCalledWith(ASTERO_BP, {
      acquisitionTierOverride: { me: 8, te: 16 },
      overridePrice: undefined,
    });
    expect(props.onClose).toHaveBeenCalled();
  });
});

describe('BlueprintAcquisitionModal — Manual', () => {
  it('forces the typed tier and price', async () => {
    const user = userEvent.setup();
    const props = renderModal();
    const manual = section('Manual tier');
    const [me, te, price] = within(manual).getAllByRole('textbox');
    await user.clear(me);
    await user.type(me, '7');
    await user.clear(te);
    await user.type(te, '14');
    await user.type(price, '25000000');
    await user.click(within(manual).getByRole('button', { name: /Use this blueprint/ }));
    expect(props.onSourcingChange).toHaveBeenCalledWith(ASTERO_BP, {
      acquisitionTierOverride: { me: 7, te: 14 },
      overridePrice: 25_000_000,
    });
  });
});

describe('BlueprintAcquisitionModal — Contracts', () => {
  it("lists copies and originals at the plan's hub region, cheapest first and marked", async () => {
    mockedLoadContracts.mockResolvedValue(
      snapshot(
        [
          contract({ contractId: 1, price: 30_000_000 }),
          contract({ contractId: 2, price: 50_000_000, regionId: DOMAIN }),
        ],
        [contract({ contractId: 3, runs: -1, me: 0, te: 0, price: 20_000_000 })]
      )
    );
    renderModal();

    const contracts = section('Contracts');
    const items = await within(contracts).findAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent(/Original \(BPO\).*20,000,000 ISK.*Cheapest/);
    expect(items[1]).toHaveTextContent(/Copy, 10 runs.*30,000,000 ISK.*3,000,000 ISK\/run/);
    expect(items[1]).toHaveTextContent('Jita IV - Moon 4');
  });

  it('widens to every region on request', async () => {
    const user = userEvent.setup();
    mockedLoadContracts.mockResolvedValue(
      snapshot([contract({ contractId: 1 }), contract({ contractId: 2, regionId: DOMAIN })])
    );
    renderModal();
    await within(section('Contracts')).findAllByRole('listitem');

    await user.click(screen.getByRole('combobox', { name: 'Contract region' }));
    await user.click(screen.getByRole('option', { name: 'All regions' }));

    expect(within(section('Contracts')).getAllByRole('listitem')).toHaveLength(2);
    expect(await within(section('Contracts')).findByText(/Domain/)).toBeInTheDocument();
  });

  it("writes a picked listing's tier and whole asking price", async () => {
    const user = userEvent.setup();
    mockedLoadContracts.mockResolvedValue(snapshot([contract({ me: 9, te: 18 })]));
    const props = renderModal();
    const [row] = await within(section('Contracts')).findAllByRole('listitem');

    await user.click(within(row).getByRole('button', { name: /Use this blueprint/ }));

    expect(props.onSourcingChange).toHaveBeenCalledWith(ASTERO_BP, {
      acquisitionTierOverride: { me: 9, te: 18 },
      overridePrice: 30_000_000,
    });
  });

  it('shows a multi-type bundle but never lets it be picked', async () => {
    mockedLoadContracts.mockResolvedValue(snapshot([contract({ isMultiType: true })]));
    renderModal();
    const [row] = await within(section('Contracts')).findAllByRole('listitem');
    expect(row).toHaveTextContent(/Bundle/);
    expect(within(row).getByRole('button', { name: /Use this blueprint/ })).toBeDisabled();
  });

  it('says so when nothing is listed in the region', async () => {
    renderModal();
    expect(
      await within(section('Contracts')).findByText('No public contract offers in The Forge.')
    ).toBeInTheDocument();
  });

  it('keeps a link to the full BPC Sourcing search', async () => {
    const user = userEvent.setup();
    const props = renderModal();
    await user.click(screen.getByRole('button', { name: /See all in BPC Sourcing/ }));
    expect(props.onSearchBpcSourcing).toHaveBeenCalledWith(ASTERO_BP);
  });
});

describe('BlueprintAcquisitionModal — Market', () => {
  it("reads the plan's own hub region, cheapest first, marking orders at the hub station", async () => {
    mockedGetOrderBook.mockResolvedValue(
      orderBook([
        sellOrder({ order_id: 1, price: 9_000_000 }),
        sellOrder({ order_id: 2, price: 4_000_000, location_id: PERIMETER }),
      ])
    );
    renderModal();

    const items = await within(section('Market (incl. NPC-seeded)')).findAllByRole('listitem');
    expect(mockedGetOrderBook).toHaveBeenCalledWith(THE_FORGE, ASTERO_BP);
    expect(items[0]).toHaveTextContent(/4,000,000 ISK.*Perimeter II.*Cheapest/);
    expect(items[1]).toHaveTextContent(/At Jita/);
  });

  it('writes a picked order as ME0/TE0 at its price', async () => {
    const user = userEvent.setup();
    mockedGetOrderBook.mockResolvedValue(orderBook([sellOrder({ price: 7_500_000 })]));
    const props = renderModal();
    const [row] = await within(section('Market (incl. NPC-seeded)')).findAllByRole('listitem');

    await user.click(within(row).getByRole('button', { name: /Use this blueprint/ }));

    expect(props.onSourcingChange).toHaveBeenCalledWith(ASTERO_BP, {
      acquisitionTierOverride: { me: 0, te: 0 },
      overridePrice: 7_500_000,
    });
  });

  it('says so when the region has no sell orders', async () => {
    renderModal();
    expect(
      await within(section('Market (incl. NPC-seeded)')).findByText('No sell orders in The Forge.')
    ).toBeInTheDocument();
  });

  it("says it couldn't load, not that nobody sells, when the fetch fails", async () => {
    mockedGetOrderBook.mockRejectedValue(new Error('420'));
    renderModal();
    const market = section('Market (incl. NPC-seeded)');
    expect(await within(market).findByText("Couldn't load sell orders.")).toBeInTheDocument();
    expect(within(market).queryByText(/No sell orders/)).not.toBeInTheDocument();
  });

  it('reads a Global Market Region item from its own region, saying why', async () => {
    const GPMR = 19000001;
    mockedLoadGlobalMarkets.mockResolvedValue([
      { typeId: ASTERO_BP, regionId: GPMR, regionName: 'GPMR-01' },
    ]);
    renderModal();
    await waitFor(() => expect(mockedGetOrderBook).toHaveBeenCalledWith(GPMR, ASTERO_BP));
    expect(mockedGetOrderBook).not.toHaveBeenCalledWith(THE_FORGE, ASTERO_BP);
    expect(
      await within(section('Market (incl. NPC-seeded)')).findByText(/Reading from GPMR-01/)
    ).toBeInTheDocument();
  });

  it("switching hub re-reads that hub's region without touching the plan", async () => {
    const user = userEvent.setup();
    const props = renderModal();
    await waitFor(() => expect(mockedGetOrderBook).toHaveBeenCalledWith(THE_FORGE, ASTERO_BP));

    await user.click(screen.getByRole('combobox', { name: 'Compare at trade hub' }));
    await user.click(screen.getByRole('option', { name: /Amarr VIII/ }));

    await waitFor(() => expect(mockedGetOrderBook).toHaveBeenCalledWith(DOMAIN, ASTERO_BP));
    expect(
      await within(section('Market (incl. NPC-seeded)')).findByText('No sell orders in Domain.')
    ).toBeInTheDocument();
    expect(props.onSourcingChange).not.toHaveBeenCalled();
  });

  it('opens at the Build Plan hub, not Jita', async () => {
    renderModal({ planHubId: 'amarr' });
    await waitFor(() => expect(mockedGetOrderBook).toHaveBeenCalledWith(DOMAIN, ASTERO_BP));
  });
});

describe('BlueprintAcquisitionModal — LP Store', () => {
  it('says so when no LP corp sells this blueprint', async () => {
    renderModal();
    expect(
      await within(section('LP Store')).findByText(/No LP Store your characters have LP with/)
    ).toBeInTheDocument();
  });

  it('names the corp and price when an LP store sells this blueprint', async () => {
    mockedFindLpOfferMatches.mockResolvedValue(lpResult([lpMatch()]));
    renderModal();
    const lp = section('LP Store');
    expect(await within(lp).findByText(/Sisters of EVE/)).toBeInTheDocument();
    expect(within(lp).getByText(/12,000,000 ISK \+ 950,000 LP/)).toBeInTheDocument();
    expect(within(lp).getByText(/ISK only — LP not priced/)).toBeInTheDocument();
  });

  it("links to the offering corp's LP Store page", async () => {
    mockedFindLpOfferMatches.mockResolvedValue(lpResult([lpMatch()]));
    renderModal();
    const link = await screen.findByRole('link', { name: /Sisters of EVE/ });
    expect(link).toHaveAttribute('href', '/wallet/loyalty/1000125');
  });

  it('lists every corp that sells it, when more than one does', async () => {
    mockedFindLpOfferMatches.mockResolvedValue(
      lpResult([
        lpMatch(),
        lpMatch({
          corporationId: 1000126,
          corpName: 'Other Corp',
          offer: { ...ASTERO_BPC_OFFER, isk_cost: 10_000_000 },
        }),
      ])
    );
    renderModal();
    const lp = section('LP Store');
    expect(await within(lp).findByText(/Sisters of EVE/)).toBeInTheDocument();
    expect(within(lp).getByText(/Other Corp/)).toBeInTheDocument();
  });

  it('notes a redemption that hands over more than one copy', async () => {
    mockedFindLpOfferMatches.mockResolvedValue(
      lpResult([lpMatch({ offer: { ...ASTERO_BPC_OFFER, quantity: 3 } })])
    );
    renderModal();
    expect(await screen.findByText(/3 copies per redemption/)).toBeInTheDocument();
  });

  it('notes when the offer also demands a turn-in item', async () => {
    mockedFindLpOfferMatches.mockResolvedValue(
      lpResult([
        lpMatch({
          offer: { ...ASTERO_BPC_OFFER, required_items: [{ type_id: 44992, quantity: 5 }] },
        }),
      ])
    );
    renderModal();
    expect(await screen.findByText(/plus 1 turn-in item/)).toBeInTheDocument();
  });

  it("looks up matches by the blueprint's own typeID, for the given character", async () => {
    renderModal({ characterId: 42, blueprintTypeID: 999 });
    await waitFor(() => expect(mockedFindLpOfferMatches).toHaveBeenCalledWith(42, [999]));
  });

  it('prices a pick at ISK + LP x the rate the pilot enters, and keeps the rate', async () => {
    const user = userEvent.setup();
    mockedFindLpOfferMatches.mockResolvedValue(lpResult([lpMatch()]));
    const props = renderModal();
    const input = screen.getByRole('textbox', { name: /Your LP value/ });
    await waitFor(() => expect(input).toBeEnabled());

    await user.clear(input);
    await user.type(input, '1000{Enter}');
    const lp = section('LP Store');
    expect(await within(lp).findByText(/962,000,000 ISK with LP/)).toBeInTheDocument();
    await user.click(within(lp).getByRole('button', { name: /Use this blueprint/ }));

    expect(props.onSourcingChange).toHaveBeenCalledWith(ASTERO_BP, {
      acquisitionTierOverride: { me: 0, te: 0 },
      overridePrice: 962_000_000,
    });
    expect(useLpValue.getState().value).toBe(1000);
  });
});
