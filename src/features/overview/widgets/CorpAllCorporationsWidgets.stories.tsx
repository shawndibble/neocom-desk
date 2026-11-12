import type { ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/ui';
import type { Contract, CorporationCustomsOffice, CorporationOrder } from '@/esi/endpoints';
import { Widget } from './Widget';
import { corpContracts } from './data/corpContractsModels';
import { corpCustomsOffices } from './data/corpCustomsModels';
import { corpOrders } from './data/corpOrdersModels';
import { corpSovereignty } from './data/corpSovereigntyModels';
import { corpStarbases } from './data/corpStarbaseModels';
import type {
  CorpContractsFeed,
  CorpCustomsFeed,
  CorpFeedBase,
  CorpOrdersFeed,
  CorpSovereigntyFeed,
  CorpStarbasesFeed,
} from './data/corpFeeds';
import type { Builder } from './data/builderKit';
import type { BuildContext, Feeds, KindView } from './data/types';
import type { Widget as WidgetModel } from './layout';

/**
 * The Gallery corp widgets on **All my corporations** (#6101): the real builders over a feed
 * merged from two corporations, drawn in the real Widget shell. Each row names its
 * corporation in a Corporation column (ticker, full name on hover and in the row's detail).
 */
const meta = {
  title: 'overview/CorpAllCorporationsWidgets',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const NOW = Date.parse('2026-11-12T12:00:00Z');
const HOUR = 3_600_000;
const MAIN = 98000001;
const HOLDING = 98000002;

/** The merged read's base: `rows` maps each row key to the corporation that holds it. */
function across(rows: [string, number][]): CorpFeedBase {
  return {
    readable: true,
    needsReauth: false,
    fetchedAt: new Date(NOW - 20 * 60_000),
    fromCache: false,
    corporations: new Map([
      [MAIN, { ticker: 'ASHV', name: 'Ashen Vanguard' }],
      [HOLDING, { ticker: 'ASHH', name: 'Ashen Holdings' }],
    ]),
    corporationOf: new Map(rows),
    partlyFailed: false,
  };
}

const SYSTEMS = new Map([
  [30002813, 'Tama'],
  [30003504, 'Efa'],
  [30002187, 'Amarr'],
]);

const office = (id: number, system: number): CorporationCustomsOffice =>
  ({
    office_id: id,
    system_id: system,
    type_id: 2233,
    reinforce_exit_start: 18,
    reinforce_exit_end: 20,
    corporation_tax_rate: 0.05,
    alliance_tax_rate: 0.08,
  }) as CorporationCustomsOffice;

const CUSTOMS: CorpCustomsFeed = {
  ...across([
    ['1', MAIN],
    ['2', HOLDING],
    ['3', MAIN],
  ]),
  offices: [office(1, 30002813), office(2, 30003504), office(3, 30002187)],
  typeNames: new Map([[2233, 'Customs Office']]),
  systemNames: SYSTEMS,
};

const STARBASES: CorpStarbasesFeed = {
  ...across([
    ['1', MAIN],
    ['2', HOLDING],
  ]),
  starbases: [
    {
      starbaseId: 1,
      systemId: 30002813,
      typeId: 12235,
      state: 'online',
      reinforcedUntilMs: null,
      unanchorsAtMs: null,
      bay: { fuelBlocks: 4_800, strontium: 1_200 },
      bayReadAtMs: NOW,
    },
    {
      starbaseId: 2,
      systemId: 30003504,
      typeId: 12235,
      state: 'online',
      reinforcedUntilMs: null,
      unanchorsAtMs: null,
      bay: { fuelBlocks: 760, strontium: 400 },
      bayReadAtMs: NOW,
    },
  ],
  typeNames: new Map([[12235, 'Amarr Control Tower']]),
  systemNames: SYSTEMS,
};

const SOVEREIGNTY: CorpSovereigntyFeed = {
  ...across([
    ['skyhook:1', MAIN],
    ['skyhook:2', HOLDING],
  ]),
  rows: [1, 2].map((id) => ({
    key: `skyhook:${id}`,
    kind: 'skyhook' as const,
    structureId: id,
    systemId: id === 1 ? 30002813 : 30003504,
    planetName: id === 1 ? 'Tama IV' : 'Efa II',
    windowStartMs: NOW + (id === 1 ? 7 : 2) * HOUR,
    windowEndMs: NOW + (id === 1 ? 9 : 4) * HOUR,
    reagents: [{ typeId: 81143, secured: 800, unsecured: id === 1 ? 400 : 120 }],
    state: 'ShieldVulnerable',
    hubBay: null,
  })),
  systemNames: SYSTEMS,
  typeNames: new Map([[81143, 'Magmatic Gas']]),
  prices: new Map([[81143, 100_000]]),
  jumps: new Map(),
};

const contract = (id: number, type: Contract['type'], expiresInHours: number): Contract => ({
  contract_id: id,
  issuer_id: 1,
  issuer_corporation_id: MAIN,
  assignee_id: 2,
  acceptor_id: 0,
  type,
  status: 'outstanding',
  for_corporation: true,
  availability: 'personal',
  title: id === 1 ? 'Fuel run to Tama' : undefined,
  collateral: type === 'courier' ? 450_000_000 : undefined,
  date_issued: new Date(NOW - 24 * HOUR).toISOString(),
  date_expired: new Date(NOW + expiresInHours * HOUR).toISOString(),
});

const CONTRACTS: CorpContractsFeed = {
  ...across([
    ['1', MAIN],
    ['2', HOLDING],
    ['3', HOLDING],
  ]),
  contracts: [
    contract(1, 'courier', 30),
    contract(2, 'item_exchange', 96),
    contract(3, 'courier', 10),
  ],
  names: new Map([
    [1, 'Tamsin Varro'],
    [2, 'Ilse Quor'],
  ]),
};

const STATION = 60003760;
const order = (id: number, isBuy: boolean, price: number): CorporationOrder => ({
  order_id: id,
  type_id: id === 1 ? 34 : 35,
  region_id: 10000002,
  location_id: STATION,
  is_buy_order: isBuy,
  issued_by: 1,
  price,
  volume_remain: 120_000,
  volume_total: 200_000,
  issued: new Date(NOW - 2 * 24 * HOUR).toISOString(),
  duration: 90,
  range: 'station',
  escrow: isBuy ? price * 120_000 : undefined,
});

const ORDERS: CorpOrdersFeed = {
  ...across([
    ['1', MAIN],
    ['2', HOLDING],
  ]),
  orders: [order(1, false, 5.2), order(2, true, 11)],
  typeNames: new Map([
    [34, 'Tritanium'],
    [35, 'Pyerite'],
  ]),
  stationNames: new Map([[STATION, 'Jita IV - Moon 4 - Caldari Navy Assembly Plant']]),
  stationPrices: new Map(),
  issuerNames: new Map([[1, 'Tamsin Varro']]),
};

function tile(kind: string): WidgetModel {
  return { id: kind, kind, size: 'L', view: 'table', scope: 'all', showOnPhone: true };
}

function Board({ kind, build, feeds }: { kind: string; build: Builder; feeds: Feeds }): ReactNode {
  const { t } = useTranslation();
  const built: KindView = build(feeds, {
    t,
    now: NOW,
    range: 30,
    activeCharacterId: 1,
    scopeAll: true,
  } as unknown as BuildContext);
  return (
    <div className="mx-auto grid max-w-page gap-3 px-4 pt-3 pb-8">
      <PageHeader title="Corp Board" meta="Ashen Vanguard" />
      <div className="grid items-start gap-3 lg:grid-cols-2">
        <Widget widget={tile(kind)} previewView={built} />
      </div>
    </div>
  );
}

const ok = <T,>(data: T) => ({ data, error: false, loading: false });

/** @summary Customs offices from two corporations, by system, each naming its corporation. */
export const CustomsOffices: Story = {
  render: () => (
    <Board
      kind="corpCustomsOffices"
      build={corpCustomsOffices}
      feeds={{ corpCustomsAll: ok(CUSTOMS) }}
    />
  ),
};

/** @summary Starbases from two corporations, soonest dry first. */
export const Starbases: Story = {
  render: () => (
    <Board kind="corpStarbases" build={corpStarbases} feeds={{ corpStarbasesAll: ok(STARBASES) }} />
  ),
};

/** @summary Skyhooks from two corporations on one raid-window timeline. */
export const Sovereignty: Story = {
  render: () => (
    <Board
      kind="corpSovereignty"
      build={corpSovereignty}
      feeds={{ corpSovereigntyAll: ok(SOVEREIGNTY) }}
    />
  ),
};

/** @summary Open contracts from two corporations; count and collateral summed. */
export const Contracts: Story = {
  render: () => (
    <Board kind="corpContracts" build={corpContracts} feeds={{ corpContractsAll: ok(CONTRACTS) }} />
  ),
};

/** @summary Open market orders from two corporations; count and escrow summed. */
export const MarketOrders: Story = {
  render: () => (
    <Board kind="corpOrders" build={corpOrders} feeds={{ corpOrdersAll: ok(ORDERS) }} />
  ),
};

/** @summary One corporation's read failed: the other's rows still draw, flagged. */
export const PartlyFailed: Story = {
  render: () => (
    <Board
      kind="corpCustomsOffices"
      build={corpCustomsOffices}
      feeds={{ corpCustomsAll: ok({ ...CUSTOMS, partlyFailed: true }) }}
    />
  ),
};
