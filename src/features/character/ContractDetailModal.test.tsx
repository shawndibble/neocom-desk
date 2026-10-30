import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { mswServer } from '@/test/msw';
import '@/i18n';
import { configureEsi, ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { seedGrant } from '@/test/seed';
import { ContractDetailModal, type ContractDetailModalProps } from './ContractDetailModal';
import { usePublicInfoModalStore } from '@/stores/publicInfoModal';
import type { Contract } from '@/esi/endpoints';
import { LocationProbe } from '@/test/LocationProbe';

vi.mock('@/sde/loadSde', () => ({
  loadTypes: vi.fn(async () => ({
    '34': { name: 'Tritanium' },
    '35': { name: 'Pyerite' },
    '638': { name: 'Rifter Blueprint' },
  })),
  loadBlueprints: vi.fn(async () => ({
    '638': {
      name: 'Rifter Blueprint',
      time: 1200,
      materials: [],
      products: [{ typeID: 587, quantity: 1 }],
      skills: [],
      activity: 'manufacturing',
    },
  })),
}));

const pricesMock = vi.hoisted(() => {
  const getHubPrices = vi.fn();
  return {
    getHubPrices,
    getHubPricesWithStatus: vi.fn(async (...args: unknown[]) => ({
      prices: (await getHubPrices(...args)) as Map<number, unknown>,
      unreachable: false,
    })),
  };
});
vi.mock('@/market/prices', () => pricesMock);

// PLEX trades only on its own market, so no hub lists it.
vi.mock('@/features/market/plexPrice', () => ({ usePlexPrice: () => 5_000_000 }));

vi.mock('@/features/abyssal/mutaplasmidData', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/abyssal/mutaplasmidData')>()),
  useMutaplasmidLookup: () => ({ isAbyssalType: (typeId: number) => typeId === 47832 }),
}));

const snapshotMock = vi.hoisted(() => ({ loadHubSnapshotRange: vi.fn() }));
vi.mock('@/features/market/hubSnapshot', () => snapshotMock);

/** The hub station's Open Price for one UTC day, by type id. */
function openPricesOn(
  date: string,
  prices: Record<number, { buy: number | null; sell: number | null }>
) {
  snapshotMock.loadHubSnapshotRange.mockResolvedValue({
    saved: new Map([[date, new Map(Object.entries(prices).map(([id, p]) => [Number(id), p]))]]),
    historical: new Map(),
  });
}

const CHAR_ID = 91;

/**
 * A station lookup that declines. Tests that don't care about the location answer with this, not a
 * request that never resolves: a pending request stays in the ESI cache's in-flight map, so every
 * later test reading the same station inherited it and waited out the full 1000ms cache settle.
 */
const NO_STATION = () => new HttpResponse(null, { status: 404 });

const ITEM_EXCHANGE: Contract = {
  contract_id: 12345,
  issuer_id: 500001,
  issuer_corporation_id: 2,
  assignee_id: 3,
  acceptor_id: 0,
  type: 'item_exchange',
  status: 'finished_contractor',
  for_corporation: false,
  availability: 'personal',
  date_issued: '2026-08-25T23:05:00Z',
  date_expired: '2026-09-01T23:05:00Z',
  date_completed: '2026-08-26T01:46:00Z',
  price: 18_205_203,
  start_location_id: 60003760,
};

const ITEM_EXCHANGE_OUTSTANDING: Contract = {
  ...ITEM_EXCHANGE,
  status: 'outstanding',
  date_completed: undefined,
};

const AUCTION_OUTSTANDING: Contract = {
  ...ITEM_EXCHANGE,
  type: 'auction',
  status: 'outstanding',
  date_completed: undefined,
  price: undefined,
  buyout: 18_205_203,
};

const COURIER: Contract = {
  contract_id: 999,
  issuer_id: 500001,
  issuer_corporation_id: 2,
  assignee_id: 3,
  acceptor_id: 0,
  type: 'courier',
  status: 'outstanding',
  for_corporation: false,
  availability: 'personal',
  date_issued: '2026-08-01T00:00:00Z',
  date_expired: '2026-08-10T00:00:00Z',
  reward: 500_000,
  collateral: 1_000_000,
  volume: 4400,
  days_to_complete: 3,
};

/** Reports where the router ended up, so a navigating menu action is assertable. */

/** `MarketItemLink` needs a router context — wrap in a router. */
function renderModal(props: ContractDetailModalProps) {
  return render(
    <MemoryRouter>
      <ContractDetailModal {...props} />
      <LocationProbe />
    </MemoryRouter>
  );
}

/** A solar system the System row can name; any other id declines, which hides the row. */
const SYSTEM_NAMES: Record<string, string> = { '30000142': 'Jita', '30002187': 'Amarr' };

const server = mswServer(
  http.get(`${ESI_BASE_URL}/universe/systems/:id`, ({ params }) => {
    const name = SYSTEM_NAMES[String(params.id)];
    return name
      ? HttpResponse.json({ system_id: Number(params.id), name, security_status: 0.9 })
      : new HttpResponse(null, { status: 404 });
  })
);
beforeEach(async () => {
  configureEsi({ getToken: vi.fn(async () => 'tok') });
  await db.esiCache.clear();
  await db.contractArchive.clear();
  await db.contractItemArchive.clear();
  usePublicInfoModalStore.setState({ request: null });
  pricesMock.getHubPrices.mockReset().mockResolvedValue(new Map());
  snapshotMock.loadHubSnapshotRange
    .mockReset()
    .mockResolvedValue({ saved: new Map(), historical: new Map() });
});
afterEach(() => {
  configureEsi({ getToken: null });
});

/**
 * Issue #3525: the own-contract modal is the only place an own contract's
 * place appears, so its system links to Route Safety like the Public and
 * Courier modals' do. The station name links to its Place Info (issue #4455).
 */
describe('ContractDetailModal System rows', () => {
  const JITA_STATION = 60003760;
  const AMARR_STATION = 60008494;

  function stationHandler(stationId: number, name: string, systemId: number) {
    return http.get(`${ESI_BASE_URL}/universe/stations/${stationId}`, () =>
      HttpResponse.json({ station_id: stationId, name, type_id: 1, system_id: systemId })
    );
  }

  it('links the start location system to Route Safety for an NPC-station contract', async () => {
    server.use(
      stationHandler(JITA_STATION, 'Jita IV - Moon 4', 30000142),
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/contracts/12345/items`, () =>
        HttpResponse.json([])
      )
    );
    renderModal({
      characterId: CHAR_ID,
      contract: ITEM_EXCHANGE,
      issuerName: 'Mero Otichoda',
      onClose: () => {},
    });
    const link = await screen.findByRole('link', { name: 'Jita' });
    expect(link).toHaveAttribute('href', expect.stringContaining('30000142'));
    expect(screen.getAllByRole('link', { name: /^(Jita|Amarr)$/ })).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'IV - Moon 4' })).toHaveAttribute(
      'href',
      expect.stringContaining(`info=place-${JITA_STATION}`)
    );
  });

  it('links both endpoint systems on a courier contract', async () => {
    server.use(
      stationHandler(JITA_STATION, 'Jita IV - Moon 4', 30000142),
      stationHandler(AMARR_STATION, 'Amarr VIII (Oris) - Emperor Family Academy', 30002187)
    );
    renderModal({
      characterId: CHAR_ID,
      contract: { ...COURIER, start_location_id: JITA_STATION, end_location_id: AMARR_STATION },
      issuerName: 'Mero Otichoda',
      onClose: () => {},
    });
    expect(await screen.findByRole('link', { name: 'Jita' })).toHaveAttribute(
      'href',
      expect.stringContaining('30000142')
    );
    expect(await screen.findByRole('link', { name: 'Amarr' })).toHaveAttribute(
      'href',
      expect.stringContaining('30002187')
    );
    expect(screen.getAllByRole('link', { name: /^(Jita|Amarr)$/ })).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'IV - Moon 4' })).toHaveAttribute(
      'href',
      expect.stringContaining(`info=place-${JITA_STATION}`)
    );
    expect(screen.getByRole('link', { name: /Emperor Family Academy/ })).toHaveAttribute(
      'href',
      expect.stringContaining(`info=place-${AMARR_STATION}`)
    );
  });

  it('shows one Location, no Destination, when both ends are the same place', async () => {
    server.use(
      stationHandler(JITA_STATION, 'Jita IV - Moon 4', 30000142),
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/contracts/12345/items`, () =>
        HttpResponse.json([])
      )
    );
    renderModal({
      characterId: CHAR_ID,
      contract: {
        ...ITEM_EXCHANGE,
        start_location_id: JITA_STATION,
        end_location_id: JITA_STATION,
      },
      issuerName: 'Mero Otichoda',
      onClose: () => {},
    });
    await screen.findByRole('link', { name: 'IV - Moon 4' });
    expect(screen.getByText('Location')).toBeInTheDocument();
    expect(screen.queryByText('Destination')).toBeNull();
    expect(screen.queryByText('→')).toBeNull();
    expect(screen.getAllByRole('link', { name: 'IV - Moon 4' })).toHaveLength(1);
  });

  it('shows one Location with an arrow when a courier ends elsewhere', async () => {
    server.use(
      stationHandler(JITA_STATION, 'Jita IV - Moon 4', 30000142),
      stationHandler(AMARR_STATION, 'Amarr VIII (Oris) - Emperor Family Academy', 30002187)
    );
    renderModal({
      characterId: CHAR_ID,
      contract: { ...COURIER, start_location_id: JITA_STATION, end_location_id: AMARR_STATION },
      issuerName: 'Mero Otichoda',
      onClose: () => {},
    });
    await screen.findByRole('link', { name: 'Amarr' });
    expect(screen.getByText('Location')).toBeInTheDocument();
    expect(screen.getByText('→')).toBeInTheDocument();
    expect(screen.queryByText('Destination')).toBeNull();
  });

  it('hides the System row when the system cannot be resolved', async () => {
    let systemAsked = false;
    server.use(
      stationHandler(JITA_STATION, 'Somewhere Station', 30009999),
      http.get(`${ESI_BASE_URL}/universe/systems/30009999`, () => {
        systemAsked = true;
        return new HttpResponse(null, { status: 404 });
      }),
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/contracts/12345/items`, () =>
        HttpResponse.json([])
      )
    );
    renderModal({
      characterId: CHAR_ID,
      contract: ITEM_EXCHANGE,
      issuerName: 'Mero Otichoda',
      onClose: () => {},
    });
    expect(await screen.findByText('Somewhere Station')).toBeInTheDocument();
    // Let the system lookup settle before asserting the row never appeared.
    await waitFor(() => expect(systemAsked).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByText('System')).toBeNull();
    expect(screen.queryByText('#30009999')).toBeNull();
  });
});

describe('ContractDetailModal', () => {
  it('renders the summary fields immediately from the contract prop, no fetch needed', () => {
    server.use(
      http.get(`${ESI_BASE_URL}/universe/stations/60003760`, NO_STATION),
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/contracts/12345/items`, () =>
        HttpResponse.json([])
      )
    );
    renderModal({
      characterId: CHAR_ID,
      contract: ITEM_EXCHANGE,
      issuerName: 'Mero Otichoda',
      onClose: () => {},
    });
    expect(screen.getByRole('dialog', { name: /Item Exchange/ })).toBeInTheDocument();
    expect(screen.getByText('Finished (Contractor)')).toBeInTheDocument();
    expect(screen.getByText('Mero Otichoda')).toBeInTheDocument();
    expect(screen.getByText('18,205,203 ISK')).toBeInTheDocument();
  });

  it('opens a link from the description in a new tab, from a button', () => {
    server.use(
      http.get(`${ESI_BASE_URL}/universe/stations/60003760`, NO_STATION),
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/contracts/12345/items`, () =>
        HttpResponse.json([])
      )
    );
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    renderModal({
      characterId: CHAR_ID,
      contract: { ...ITEM_EXCHANGE, title: 'Price list https://example.com/list' },
      issuerName: 'Mero Otichoda',
      onClose: () => {},
    });
    expect(screen.getByRole('dialog', { name: /Item Exchange/ })).toBeInTheDocument();
    expect(screen.getByText('Price list https://example.com/list')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Open example\.com/ }));
    expect(open).toHaveBeenCalledWith('https://example.com/list', '_blank', 'noopener,noreferrer');
    open.mockRestore();
  });

  it('resolves the location name once the station lookup returns', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/universe/stations/60003760`, () =>
        HttpResponse.json({
          station_id: 60003760,
          name: 'Tycho Brahe 18 HQ',
          type_id: 1,
          system_id: 2,
        })
      ),
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/contracts/12345/items`, () =>
        HttpResponse.json([])
      )
    );
    renderModal({
      characterId: CHAR_ID,
      contract: ITEM_EXCHANGE,
      issuerName: 'Mero Otichoda',
      onClose: () => {},
    });
    expect(await screen.findByText('Tycho Brahe 18 HQ')).toBeInTheDocument();
  });

  it('splits item lines into Included and Requested tables', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/universe/stations/60003760`, () =>
        HttpResponse.json({ station_id: 60003760, name: 'Jita', type_id: 1, system_id: 2 })
      ),
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/contracts/12345/items`, () =>
        HttpResponse.json([
          { record_id: 1, type_id: 34, quantity: 744, is_included: true, is_singleton: false },
          { record_id: 2, type_id: 35, quantity: 1, is_included: false, is_singleton: false },
        ])
      )
    );
    renderModal({
      characterId: CHAR_ID,
      contract: ITEM_EXCHANGE,
      issuerName: 'Mero Otichoda',
      onClose: () => {},
    });
    const included = await screen.findByRole('table', { name: 'Included' });
    expect(within(included).getByText('744')).toBeInTheDocument();
    const requested = screen.getByRole('table', { name: 'Requested' });
    expect(within(requested).getByText('1')).toBeInTheDocument();
  });

  it('says it could not load the items, not "no item data", when the read failed, and retries', async () => {
    let fail = true;
    server.use(
      http.get(`${ESI_BASE_URL}/universe/stations/60003760`, () =>
        HttpResponse.json({ station_id: 60003760, name: 'Jita', type_id: 1, system_id: 2 })
      ),
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/contracts/12345/items`, () =>
        fail
          ? HttpResponse.error()
          : HttpResponse.json([
              { record_id: 1, type_id: 34, quantity: 744, is_included: true, is_singleton: false },
            ])
      )
    );
    renderModal({
      characterId: CHAR_ID,
      contract: ITEM_EXCHANGE,
      issuerName: 'Mero Otichoda',
      onClose: () => {},
    });
    expect(await screen.findAllByText("Couldn't load")).not.toHaveLength(0);
    expect(screen.queryByText('No item data for this contract')).not.toBeInTheDocument();

    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    const included = await screen.findByRole('table', { name: 'Included' });
    expect(within(included).getByText('744')).toBeInTheDocument();
  });

  function itemsGone() {
    server.use(
      http.get(`${ESI_BASE_URL}/universe/stations/60003760`, () =>
        HttpResponse.json({ station_id: 60003760, name: 'Jita', type_id: 1, system_id: 2 })
      ),
      http.get(
        `${ESI_BASE_URL}/characters/${CHAR_ID}/contracts/12345/items`,
        () => new HttpResponse(null, { status: 404 })
      )
    );
  }

  it('says items were not kept for an old contract ESI no longer has, with no Retry', async () => {
    itemsGone();
    renderModal({
      characterId: CHAR_ID,
      contract: ITEM_EXCHANGE,
      issuerName: 'Mero Otichoda',
      onClose: () => {},
    });
    expect(await screen.findByText('Items not kept for this contract')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Couldn't load/)).not.toBeInTheDocument();
  });

  it('treats a 404 on a recent contract as "no item data", with no Retry', async () => {
    itemsGone();
    const now = `${new Date().toISOString().slice(0, 19)}Z`;
    renderModal({
      characterId: CHAR_ID,
      contract: { ...ITEM_EXCHANGE, date_issued: now, date_expired: now, date_completed: now },
      issuerName: 'Mero Otichoda',
      onClose: () => {},
    });
    expect(await screen.findByText('No item data for this contract')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('shows the items kept when the pilot opened the contract before ESI dropped it', async () => {
    itemsGone();
    await db.contractArchive.put({ ...ITEM_EXCHANGE, characterId: CHAR_ID, archiveDate: '' });
    await db.contractItemArchive.put({
      characterId: CHAR_ID,
      contract_id: 12345,
      items: [{ record_id: 1, type_id: 34, quantity: 5, is_included: true, is_singleton: false }],
    });
    renderModal({
      characterId: CHAR_ID,
      contract: ITEM_EXCHANGE,
      issuerName: 'Mero Otichoda',
      onClose: () => {},
    });
    expect(await screen.findByText('Included')).toBeInTheDocument();
    expect(screen.queryByText('Items not kept for this contract')).not.toBeInTheDocument();
  });

  /*
   * Two short columns (icon + name, quantity) fit a 390px screen unaided, so
   * the stacked card layout would only add a "QUANTITY" gutter label to a
   * one-word value. `.dt-stack` is CSS, so the class is what there is to
   * assert — same check as `DataTable.test.tsx`'s responsive suite.
   */
  it('keeps the item tables as real tables on mobile', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/universe/stations/60003760`, () =>
        HttpResponse.json({ station_id: 60003760, name: 'Jita', type_id: 1, system_id: 2 })
      ),
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/contracts/12345/items`, () =>
        HttpResponse.json([
          { record_id: 1, type_id: 34, quantity: 744, is_included: true, is_singleton: false },
          { record_id: 2, type_id: 35, quantity: 1, is_included: false, is_singleton: false },
        ])
      )
    );
    renderModal({
      characterId: CHAR_ID,
      contract: ITEM_EXCHANGE,
      issuerName: 'Mero Otichoda',
      onClose: () => {},
    });
    expect(await screen.findByRole('table', { name: 'Included' })).not.toHaveClass('dt-stack');
    expect(screen.getByRole('table', { name: 'Requested' })).not.toHaveClass('dt-stack');
  });

  it('never fetches items for a courier contract, and shows its own fields', () => {
    renderModal({
      characterId: CHAR_ID,
      contract: COURIER,
      issuerName: 'Mero Otichoda',
      onClose: () => {},
    });
    expect(screen.getByText('500,000 ISK')).toBeInTheDocument();
    expect(screen.getByText('1,000,000 ISK')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('links an item-exchange line item through to Market (issue #417)', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/universe/stations/60003760`, NO_STATION),
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/contracts/12345/items`, () =>
        HttpResponse.json([
          { record_id: 1, type_id: 34, quantity: 744, is_included: true, is_singleton: false },
        ])
      )
    );
    renderModal({
      characterId: CHAR_ID,
      contract: ITEM_EXCHANGE,
      issuerName: 'Mero Otichoda',
      onClose: () => {},
    });
    const link = await screen.findByRole('link', { name: /Tritanium/ });
    expect(link).toHaveAttribute('href', expect.stringContaining('info=type-'));
  });

  it('right-clicking a blueprint line item starts a Build Plan for what it builds', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/universe/stations/60003760`, NO_STATION),
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/contracts/12345/items`, () =>
        HttpResponse.json([
          { record_id: 1, type_id: 638, quantity: 1, is_included: true, is_singleton: true },
        ])
      )
    );
    renderModal({
      characterId: CHAR_ID,
      contract: ITEM_EXCHANGE,
      issuerName: 'Mero Otichoda',
      onClose: () => {},
    });

    const included = await screen.findByRole('table', { name: 'Included' });
    fireEvent.contextMenu(within(included).getByText('Rifter Blueprint'));

    fireEvent.click(await screen.findByRole('menuitem', { name: 'Build Plan' }));

    // 587 (Rifter), not 638 (the blueprint on the contract).
    expect(screen.getByTestId('location')).toHaveTextContent('/industry/plans?product=587');
  });

  it('shows a Received By row when a receiver is passed, none otherwise', () => {
    const { unmount } = renderModal({
      characterId: CHAR_ID,
      contract: ITEM_EXCHANGE,
      issuerName: 'Mero Otichoda',
      receiver: { id: 42, kind: 'character', role: 'assignee' },
      receiverName: 'Buyer Bob',
      onClose: () => {},
    });
    expect(screen.getByText('Received By')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Buyer Bob' })).toBeInTheDocument();
    expect(screen.getByText('(offered)')).toBeInTheDocument();
    unmount();
    renderModal({
      characterId: CHAR_ID,
      contract: ITEM_EXCHANGE,
      issuerName: 'Mero Otichoda',
      onClose: () => {},
    });
    expect(screen.queryByText('Received By')).not.toBeInTheDocument();
  });

  it('shows a standing tag beside the issuer when one is passed', () => {
    renderModal({
      characterId: CHAR_ID,
      contract: ITEM_EXCHANGE,
      issuerName: 'Mero Otichoda',
      issuerStanding: {
        standing: -10,
        source: 'character',
        sourceId: ITEM_EXCHANGE.issuer_id,
        inherited: false,
        contact: { contact_id: ITEM_EXCHANGE.issuer_id, contact_type: 'character', standing: -10 },
      },
      onClose: () => {},
    });
    expect(
      screen.getByRole('img', { name: 'Your contact: Terrible standing (-10)' })
    ).toBeInTheDocument();
  });

  it('shows no standing tag when none is passed (stranger, or omitted entirely)', () => {
    renderModal({
      characterId: CHAR_ID,
      contract: ITEM_EXCHANGE,
      issuerName: 'Mero Otichoda',
      onClose: () => {},
    });
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('issuer name links to the shared Public Info Modal (issue #417)', () => {
    renderModal({
      characterId: CHAR_ID,
      contract: ITEM_EXCHANGE,
      issuerName: 'Mero Otichoda',
      onClose: () => {},
    });
    expect(screen.getByRole('link', { name: 'Mero Otichoda' })).toHaveAttribute(
      'href',
      expect.stringContaining(`info=character-${ITEM_EXCHANGE.issuer_id}`)
    );
  });

  describe('Price check', () => {
    const ONE_LINE = [
      { record_id: 1, type_id: 34, quantity: 744, is_included: true, is_singleton: false },
    ];
    const FINISHED_FOR_4000: Contract = { ...ITEM_EXCHANGE, price: 4_000 };
    const OUTSTANDING_FOR_4000: Contract = { ...ITEM_EXCHANGE_OUTSTANDING, price: 4_000 };

    function serve(items: unknown[]) {
      server.use(
        http.get(`${ESI_BASE_URL}/universe/stations/60003760`, NO_STATION),
        http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/contracts/12345/items`, () =>
          HttpResponse.json(items)
        )
      );
    }
    function open(contract: Contract) {
      return renderModal({
        characterId: CHAR_ID,
        contract,
        issuerName: 'Mero Otichoda',
        onClose: () => {},
      });
    }

    it('checks a finished contract at the hub station Open Price of the day it was issued', async () => {
      openPricesOn('2026-08-25', { 34: { buy: 5, sell: 5.5 } });
      serve(ONE_LINE);
      open(FINISHED_FOR_4000);

      const check = await screen.findByRole('region', {
        name: 'Price check · Jita 4-4 at close of Aug 25',
      });
      expect(snapshotMock.loadHubSnapshotRange).toHaveBeenCalledWith(
        '2026-08-25',
        '2026-08-25',
        [34],
        expect.objectContaining({ id: 'jita' })
      );
      expect(await within(check).findByText('4,000 ISK')).toBeInTheDocument(); // asking
      expect(within(check).getByText('3,720 ISK')).toBeInTheDocument(); // 744 * 5, buy
      expect(within(check).getByText('+7.5%')).toBeInTheDocument();
      expect(within(check).getByText('Asking is above buy orders')).toBeInTheDocument();
      expect(pricesMock.getHubPrices).not.toHaveBeenCalled();
    });

    it('flips to sell orders when the side label is pressed, and every figure follows', async () => {
      openPricesOn('2026-08-25', { 34: { buy: 5, sell: 5.5 } });
      serve(ONE_LINE);
      open(FINISHED_FOR_4000);

      const check = await screen.findByRole('region', { name: /^Price check/ });
      await within(check).findByText('3,720 ISK');
      fireEvent.click(within(check).getByRole('button', { name: 'Buy orders' }));
      expect(within(check).getByRole('button', { name: 'Sell orders' })).toBeInTheDocument();
      expect(within(check).getByText('4,092 ISK')).toBeInTheDocument(); // 744 * 5.5
      expect(within(check).getByText('−2.2%')).toBeInTheDocument();
      expect(within(check).getByText('Asking is below sell orders')).toBeInTheDocument();
    });

    it('says there is no Open Price for that day, never 0', async () => {
      serve(ONE_LINE);
      open(FINISHED_FOR_4000);

      const check = await screen.findByRole('region', { name: /^Price check/ });
      expect(await within(check).findByText('No Open Price for Aug 25')).toBeInTheDocument();
      expect(within(check).queryByText(/ISK/)).not.toBeInTheDocument();
    });

    it('checks an outstanding contract against the live book instead', async () => {
      pricesMock.getHubPrices.mockResolvedValue(
        new Map([[34, { sellMin: 5.5, buyMax: 5, sellVolume: 0, buyVolume: 0 }]])
      );
      serve(ONE_LINE);
      open(OUTSTANDING_FOR_4000);

      const check = await screen.findByRole('region', { name: 'Is it fair? · Jita 4-4 right now' });
      expect(await within(check).findByText('3,720 ISK')).toBeInTheDocument();
      expect(snapshotMock.loadHubSnapshotRange).not.toHaveBeenCalled();
    });

    it('also checks an outstanding auction, against its buyout', async () => {
      pricesMock.getHubPrices.mockResolvedValue(
        new Map([[34, { sellMin: 5.5, buyMax: 5, sellVolume: 0, buyVolume: 0 }]])
      );
      serve(ONE_LINE);
      open({ ...AUCTION_OUTSTANDING, buyout: 4_000 });

      const check = await screen.findByRole('region', { name: /^Is it fair/ });
      expect(await within(check).findByText('+7.5%')).toBeInTheDocument();
    });

    it("never prices a blueprint copy at the original's hub price", async () => {
      // 638 trades at the hub as an original; ESI marks a copy with raw_quantity -2.
      pricesMock.getHubPrices.mockResolvedValue(
        new Map([
          [34, { sellMin: 5.5, buyMax: 5, sellVolume: 0, buyVolume: 0 }],
          [638, { sellMin: 1_000_000_000, buyMax: 900_000_000, sellVolume: 0, buyVolume: 0 }],
        ])
      );
      serve([
        {
          record_id: 1,
          type_id: 638,
          quantity: 1,
          raw_quantity: -2,
          is_included: true,
          is_singleton: true,
        },
        ...ONE_LINE,
      ]);
      open(OUTSTANDING_FOR_4000);

      const check = await screen.findByRole('region', { name: /^Is it fair/ });
      expect(await within(check).findByText('3,720 ISK')).toBeInTheDocument(); // the Tritanium only
      expect(within(check).getByText(/\(1 item unpriced\)/)).toBeInTheDocument();
      expect(within(check).queryByText(/900,000,000/)).not.toBeInTheDocument();
    });

    it('counts lines it could not price instead of treating them as free', async () => {
      pricesMock.getHubPrices.mockResolvedValue(
        new Map([
          [34, { sellMin: 5.5, buyMax: 5, sellVolume: 0, buyVolume: 0 }],
          [35, { sellMin: null, buyMax: null, sellVolume: 0, buyVolume: 0 }],
        ])
      );
      serve([
        ...ONE_LINE,
        { record_id: 2, type_id: 35, quantity: 10, is_included: true, is_singleton: false },
      ]);
      open(OUTSTANDING_FOR_4000);

      const check = await screen.findByRole('region', { name: /^Is it fair/ });
      expect(await within(check).findByText(/\(1 item unpriced\)/)).toBeInTheDocument();
      expect(within(check).getByText('3,720 ISK')).toBeInTheDocument();
    });

    it('says nothing is priced when no line has a price, never a value of 0', async () => {
      pricesMock.getHubPrices.mockResolvedValue(
        new Map([[34, { sellMin: null, buyMax: null, sellVolume: 0, buyVolume: 0 }]])
      );
      serve(ONE_LINE);
      open(OUTSTANDING_FOR_4000);

      const check = await screen.findByRole('region', { name: /^Is it fair/ });
      expect(await within(check).findByText('Not priced at Jita 4-4')).toBeInTheDocument();
    });

    it('does not read an unreachable price source as an empty market', async () => {
      pricesMock.getHubPricesWithStatus.mockResolvedValueOnce({
        prices: new Map(),
        unreachable: true,
      });
      serve(ONE_LINE);
      open(OUTSTANDING_FOR_4000);

      const check = await screen.findByRole('region', { name: /^Is it fair/ });
      expect(await within(check).findByText(/unavailable/i)).toBeInTheDocument();
      expect(within(check).queryByText('Not priced at Jita 4-4')).not.toBeInTheDocument();
    });

    it('prices PLEX from its own market on a live check, since no hub lists it', async () => {
      serve([
        { record_id: 1, type_id: 44992, quantity: 2, is_included: true, is_singleton: false },
      ]);
      open({ ...OUTSTANDING_FOR_4000, price: 12_000_000 });

      const check = await screen.findByRole('region', { name: /^Is it fair/ });
      // PLEX has no buy orders: flip to sell, where its market price applies.
      fireEvent.click(await within(check).findByRole('button', { name: 'Buy orders' }));
      expect(await within(check).findByText('10,000,000 ISK')).toBeInTheDocument(); // 2 x 5M
      expect(within(check).getByText('+20.0%')).toBeInTheDocument();
    });

    it('judges an auction on its buyout, not its starting bid', async () => {
      pricesMock.getHubPrices.mockResolvedValue(
        new Map([[34, { sellMin: 5.5, buyMax: 5, sellVolume: 0, buyVolume: 0 }]])
      );
      serve(ONE_LINE);
      open({ ...AUCTION_OUTSTANDING, price: 1_000, buyout: 4_000 });

      const check = await screen.findByRole('region', { name: /^Is it fair/ });
      expect(await within(check).findByText('+7.5%')).toBeInTheDocument(); // 4,000 against 3,720
      expect(within(check).queryByText('1,000 ISK')).not.toBeInTheDocument();
    });

    it('compares Included to Requested for an item-for-item contract', async () => {
      openPricesOn('2026-08-25', { 34: { buy: 5, sell: 5.5 }, 35: { buy: 6, sell: 7 } });
      serve([
        ...ONE_LINE,
        { record_id: 2, type_id: 35, quantity: 100, is_included: false, is_singleton: false },
      ]);
      open({ ...ITEM_EXCHANGE, price: undefined });

      const check = await screen.findByRole('region', { name: /^Price check/ });
      expect(await within(check).findByText('3,720 ISK')).toBeInTheDocument(); // included, buy
      expect(within(check).getByText('600.00 ISK')).toBeInTheDocument(); // requested, buy
      expect(within(check).getByText('+520.0%')).toBeInTheDocument();
      expect(within(check).getByText('Included is above Requested')).toBeInTheDocument();
    });

    it('shows no price check where there is nothing to compare: a courier, or a contract with no ask', async () => {
      const { unmount } = renderModal({
        characterId: CHAR_ID,
        contract: COURIER,
        issuerName: 'Mero Otichoda',
        onClose: () => {},
      });
      expect(
        screen.queryByRole('region', { name: /Price check|Is it fair/ })
      ).not.toBeInTheDocument();
      unmount();

      serve(ONE_LINE);
      open({ ...ITEM_EXCHANGE, price: 0 });
      await screen.findByRole('table', { name: 'Included' });
      expect(
        screen.queryByRole('region', { name: /Price check|Is it fair/ })
      ).not.toBeInTheDocument();
      expect(snapshotMock.loadHubSnapshotRange).not.toHaveBeenCalled();
      expect(pricesMock.getHubPrices).not.toHaveBeenCalled();
    });

    it('keeps an abyssal module out of the figure and says it is not priced, and why', async () => {
      // Own-contract lines carry no item id, so a module cannot be identified to MutaMarket.
      openPricesOn('2026-08-25', { 34: { buy: 5, sell: 5.5 } });
      serve([
        ...ONE_LINE,
        { record_id: 2, type_id: 47832, quantity: 1, is_included: true, is_singleton: true },
      ]);
      open(FINISHED_FOR_4000);

      const check = await screen.findByRole('region', { name: /^Price check/ });
      expect(await within(check).findByText('3,720 ISK')).toBeInTheDocument(); // the Tritanium only
      expect(screen.getByText('Abyssal modules (MutaMarket estimate)')).toBeInTheDocument();
      expect(screen.getByText('Not priced')).toBeInTheDocument();
      expect(screen.getByText(/worth its own rolls/)).toBeInTheDocument();
    });
  });

  describe('Layout', () => {
    it('shows the status as a pill beside the title, and the id with copy and Open in EVE under it', async () => {
      await seedGrant(CHAR_ID, ['esi-ui.open_window.v1']);
      useActiveCharacter.setState({ activeCharacterId: CHAR_ID, hydrated: true });
      renderModal({
        characterId: CHAR_ID,
        contract: ITEM_EXCHANGE,
        issuerName: 'Mero Otichoda',
        onClose: () => {},
      });
      const dialog = screen.getByRole('dialog', { name: /Item Exchange/ });
      expect(within(dialog).getByText('Finished (Contractor)')).toBeInTheDocument();
      expect(within(dialog).getByText('12345')).toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: 'Copy contract ID' })).toBeInTheDocument();
      expect(
        await within(dialog).findByRole('button', { name: 'Open in EVE: contract 12345' })
      ).toBeInTheDocument();
    });

    it('drops ISK rows that are zero instead of printing 0.00', () => {
      renderModal({
        characterId: CHAR_ID,
        contract: { ...ITEM_EXCHANGE, price: 4_000, reward: 0, collateral: 0 },
        issuerName: 'Mero Otichoda',
        onClose: () => {},
      });
      expect(screen.getByText('4,000 ISK')).toBeInTheDocument();
      expect(screen.queryByText('Acceptor Receives')).not.toBeInTheDocument();
      expect(screen.queryByText('Collateral')).not.toBeInTheDocument();
      expect(screen.queryByText('0.00')).not.toBeInTheDocument();
    });

    it('shows the contract as a timeline, with no separate date rows or days-to-complete', () => {
      renderModal({
        characterId: CHAR_ID,
        contract: {
          ...ITEM_EXCHANGE,
          date_accepted: '2026-08-25T23:06:10Z',
          date_completed: '2026-08-25T23:06:40Z',
          days_to_complete: 0,
        },
        issuerName: 'Mero Otichoda',
        onClose: () => {},
      });
      const steps = within(screen.getByRole('list', { name: 'Contract progress' })).getAllByRole(
        'listitem'
      );
      expect(steps).toHaveLength(3);
      expect(screen.getByText('Same minute')).toBeInTheDocument();
      expect(screen.queryByText('Date Issued')).not.toBeInTheDocument();
      expect(screen.queryByText('Days To Complete')).not.toBeInTheDocument();
    });

    it('folds the volume into the Items figure instead of a chip of its own', async () => {
      server.use(
        http.get(`${ESI_BASE_URL}/universe/stations/60003760`, NO_STATION),
        http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/contracts/12345/items`, () =>
          HttpResponse.json([
            { record_id: 1, type_id: 34, quantity: 744, is_included: true, is_singleton: false },
          ])
        )
      );
      renderModal({
        characterId: CHAR_ID,
        contract: { ...ITEM_EXCHANGE, price: 4_000, volume: 92_300.4 },
        issuerName: 'Mero Otichoda',
        onClose: () => {},
      });
      expect(await screen.findByText('1 line · 92,300.4 m³')).toBeInTheDocument();
      expect(screen.queryByText('Volume')).not.toBeInTheDocument();
    });

    it('keeps the volume as its own figure where there are no item lines, as on a courier', () => {
      renderModal({
        characterId: CHAR_ID,
        contract: COURIER,
        issuerName: 'Mero Otichoda',
        onClose: () => {},
      });
      expect(screen.getByText('Volume')).toBeInTheDocument();
      expect(screen.getByText('4,400 m³')).toBeInTheDocument();
    });

    it('counts down to the expiry of a contract that can still be taken, and dates a finished one', () => {
      const { unmount } = renderModal({
        characterId: CHAR_ID,
        contract: { ...COURIER, date_expired: '2099-01-01T00:00:00Z' },
        issuerName: 'Mero Otichoda',
        onClose: () => {},
      });
      expect(screen.getByText('Expires in')).toBeInTheDocument();
      expect(screen.getByText(/^\d+d \d+h \d+m$/)).toBeInTheDocument();
      unmount();

      renderModal({
        characterId: CHAR_ID,
        contract: ITEM_EXCHANGE,
        issuerName: 'Mero Otichoda',
        onClose: () => {},
      });
      // Finished: no countdown, and the date it finished is in the strip.
      expect(screen.queryByText('Expires in')).not.toBeInTheDocument();
      expect(screen.getAllByText('Completed').length).toBeGreaterThan(0);
    });

    it('ends a deleted or cancelled contract on its outcome, with no acceptance to wait for', () => {
      for (const [status, label] of [
        ['deleted', 'Deleted'],
        ['cancelled', 'Cancelled'],
        ['rejected', 'Rejected'],
      ] as const) {
        const { unmount } = renderModal({
          characterId: CHAR_ID,
          contract: { ...ITEM_EXCHANGE, status, date_completed: undefined, acceptor_id: 0 },
          issuerName: 'Mero Otichoda',
          onClose: () => {},
        });
        const steps = within(screen.getByRole('list', { name: 'Contract progress' })).getAllByRole(
          'listitem'
        );
        expect(steps.map((li) => li.querySelector('b')?.textContent)).toEqual(['Issued', label]);
        expect(screen.queryByText('Waiting')).not.toBeInTheDocument();
        // An expiry means nothing to a contract that can no longer be taken.
        expect(screen.queryByText('Expires')).not.toBeInTheDocument();
        expect(screen.queryByText('Expires in')).not.toBeInTheDocument();
        unmount();
      }
    });

    it('calls an outstanding contract past its expiry expired, in the strip and the timeline', () => {
      renderModal({
        characterId: CHAR_ID,
        contract: {
          ...ITEM_EXCHANGE_OUTSTANDING,
          date_issued: '2020-01-01T00:00:00Z',
          date_expired: '2020-01-15T00:00:00Z',
        },
        issuerName: 'Mero Otichoda',
        onClose: () => {},
      });
      expect(screen.getAllByText('Expired')).toHaveLength(2); // headline chip and timeline step
      expect(screen.queryByText('Waiting')).not.toBeInTheDocument();
      expect(screen.queryByText('Expires in')).not.toBeInTheDocument();
    });

    it('keeps the type and availability in one quiet line', () => {
      renderModal({
        characterId: CHAR_ID,
        contract: ITEM_EXCHANGE,
        issuerName: 'Mero Otichoda',
        onClose: () => {},
      });
      expect(screen.getByText(/Item Exchange · Private/)).toBeInTheDocument();
    });
  });
});

/** Issue #4780: a contract that is a buyback Quote's names the Request, links to it and flags another price. */
describe('ContractDetailModal buyback line', () => {
  const BUYBACK = {
    requestId: 'req-9',
    communityId: 'c-1',
    communityName: 'Efa Miners',
    requestTitle: 'All ore',
    quotedTotal: 18_205_203,
  };
  const handlers = () =>
    server.use(
      http.get(`${ESI_BASE_URL}/universe/stations/60003760`, () =>
        HttpResponse.json({
          station_id: 60003760,
          name: 'Jita IV',
          type_id: 1,
          system_id: 30000142,
        })
      ),
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/contracts/12345/items`, () =>
        HttpResponse.json([])
      )
    );

  beforeEach(async () => {
    await db.settings.clear();
  });

  it('shows no buyback line for an ordinary contract', async () => {
    handlers();
    renderModal({
      characterId: CHAR_ID,
      contract: ITEM_EXCHANGE_OUTSTANDING,
      issuerName: 'Mero',
      onClose: () => {},
    });
    await screen.findByText('12345');
    expect(screen.queryByText(/^Buyback/)).not.toBeInTheDocument();
  });

  it('links a buyback contract to its Request', async () => {
    handlers();
    await db.settings.put({
      key: `buybackLinks:${CHAR_ID}`,
      value: { '12345': BUYBACK },
    });
    renderModal({
      characterId: CHAR_ID,
      contract: ITEM_EXCHANGE_OUTSTANDING,
      issuerName: 'Mero',
      onClose: () => {},
    });
    const link = await screen.findByRole('link', { name: 'Buyback · All ore in Efa Miners' });
    expect(link).toHaveAttribute('href', '/communities?community=c-1&tab=requests&request=req-9');
    expect(screen.queryByText(/Price differs from quote/)).not.toBeInTheDocument();
  });

  it('flags a contract at another price than the quote', async () => {
    handlers();
    await db.settings.put({
      key: `buybackLinks:${CHAR_ID}`,
      value: { '12345': { ...BUYBACK, quotedTotal: 42_100_000 } },
    });
    renderModal({
      characterId: CHAR_ID,
      contract: ITEM_EXCHANGE_OUTSTANDING,
      issuerName: 'Mero',
      onClose: () => {},
    });
    expect(
      await screen.findByText('Price differs from quote · 42,100,000 ISK quoted')
    ).toBeInTheDocument();
  });
});
