import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useTranslation } from 'react-i18next';
import {
  DataAgeBadge,
  DataTable,
  FilterBar,
  FilterChip,
  IconButton,
  IskAmount,
  PageHeader,
  Panel,
  SearchInput,
  TabPanel,
  Tabs,
  useTabsId,
  type DataTableColumn,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { NewComponent } from './NewComponent';

/**
 * Proposal (T6b): Contracts › Item search gains a "Below market" chip. With
 * it on, the table turns into one row per contract (not one per item line):
 * Item "Rifter + 12 more", Value, Asking, Profit and Jumps, sorted by Profit,
 * largest first. Value is the default Trade Hub's best buy × quantity minus
 * sales tax; an item with no market is valued from other public contract
 * offers of the same type, and the Value cell says which ("market" / "from 8
 * contracts"). A dim line under the bar gives the snapshot's age (the header's
 * data age badge is hidden on a phone) and what is left out.
 *
 * Chip placement: the chip sits in the filter bar's `actions` slot, beside
 * the search box, not behind the funnel (§4b): like the column picker it acts
 * at once and changes the table's columns and row shape, so it is a view
 * control, and it stays one tap away on a phone.
 *
 * New components in this mockup: `BelowMarketChip` (the chip in the bar),
 * `BelowMarketNote` (the snapshot age and exclusions line). The table is the
 * existing `DataTable` with new columns.
 */

interface ContractRow {
  id: number;
  item: string;
  /** Other item lines in the contract. */
  more: number;
  value: number;
  /** Where the value came from: `market`, or how many other offers priced it. */
  source: 'market' | number;
  asking: number;
  jumps: number;
  system: string;
}

interface OfferRow {
  id: number;
  item: string;
  qty: number;
  price: number;
  system: string;
  jumps: number;
}

const CONTRACTS: ContractRow[] = [
  {
    id: 1,
    item: 'Rifter',
    more: 12,
    value: 182_400_000,
    source: 'market',
    asking: 140_400_000,
    jumps: 3,
    system: 'Perimeter',
  },
  {
    id: 2,
    item: 'Tengu',
    more: 0,
    value: 418_600_000,
    source: 'market',
    asking: 400_000_000,
    jumps: 7,
    system: 'Urlen',
  },
  {
    id: 3,
    item: 'Hulk',
    more: 4,
    value: 331_200_000,
    source: 'market',
    asking: 320_000_000,
    jumps: 12,
    system: 'Hek',
  },
  {
    id: 4,
    item: 'Gila Blueprint (copy, 3 runs)',
    more: 0,
    value: 92_800_000,
    source: 8,
    asking: 84_000_000,
    jumps: 5,
    system: 'Sobaseki',
  },
  {
    id: 5,
    item: 'Damage Control II ×40',
    more: 0,
    value: 21_300_000,
    source: 'market',
    asking: 17_200_000,
    jumps: 0,
    system: 'Jita',
  },
  {
    id: 6,
    item: 'Large Skill Injector ×2',
    more: 0,
    value: 1_624_000_000,
    source: 'market',
    asking: 1_620_000_000,
    jumps: 9,
    system: 'Amarr',
  },
  {
    id: 7,
    item: 'Caldari Navy Hookbill',
    more: 3,
    value: 38_600_000,
    source: 'market',
    asking: 36_000_000,
    jumps: 2,
    system: 'Maurasi',
  },
  {
    id: 8,
    item: 'Ishtar Blueprint (copy, 1 run)',
    more: 0,
    value: 61_500_000,
    source: 3,
    asking: 59_900_000,
    jumps: 4,
    system: 'Itamo',
  },
];

const OFFERS: OfferRow[] = [
  { id: 1, item: 'Rifter', qty: 1, price: 650_000, system: 'Jita', jumps: 0 },
  { id: 2, item: 'Rifter', qty: 5, price: 3_100_000, system: 'Perimeter', jumps: 1 },
  { id: 3, item: 'Rifter', qty: 1, price: 590_000, system: 'Hek', jumps: 12 },
  { id: 4, item: 'Rifter', qty: 12, price: 7_400_000, system: 'Rens', jumps: 15 },
  { id: 5, item: 'Rifter', qty: 1, price: 720_000, system: 'Amarr', jumps: 9 },
];

const profit = (row: ContractRow) => row.value - row.asking;

function ItemCell({ row }: { row: ContractRow }) {
  return (
    <span>
      {row.item}
      {row.more > 0 && <span className="text-text-dim"> + {row.more} more</span>}
    </span>
  );
}

const contractColumns: DataTableColumn<ContractRow>[] = [
  {
    id: 'item',
    header: 'Item',
    primary: true,
    sortValue: (row) => row.item,
    render: (row) => <ItemCell row={row} />,
  },
  {
    id: 'value',
    header: 'Value',
    align: 'right',
    className: 'tabular-nums whitespace-nowrap',
    sortValue: (row) => row.value,
    stackAffix: { before: 'Value ' },
    render: (row) => (
      <>
        <IskAmount value={row.value} decimals={0} />
        <span className="ml-1 text-[0.625rem] text-text-dim sm:ml-0 sm:block">
          {row.source === 'market' ? 'market' : `from ${row.source} contracts`}
        </span>
      </>
    ),
  },
  {
    id: 'asking',
    header: 'Asking',
    align: 'right',
    className: 'tabular-nums whitespace-nowrap',
    sortValue: (row) => row.asking,
    stackAffix: { before: 'Asking ' },
    render: (row) => <IskAmount value={row.asking} decimals={0} />,
  },
  {
    id: 'profit',
    header: 'Profit',
    align: 'right',
    cardCorner: true,
    className: 'tabular-nums whitespace-nowrap text-isk-pos',
    sortValue: profit,
    render: (row) => (
      <>
        +<IskAmount value={profit(row)} decimals={0} />
      </>
    ),
  },
  {
    id: 'system',
    header: 'System',
    sortValue: (row) => row.system,
    render: (row) => row.system,
  },
  {
    id: 'jumps',
    header: 'Jumps',
    align: 'right',
    className: 'tabular-nums',
    sortValue: (row) => row.jumps,
    stackAffix: { before: 'Jumps ' },
    render: (row) => row.jumps,
  },
];

const offerColumns: DataTableColumn<OfferRow>[] = [
  { id: 'item', header: 'Item', primary: true, render: (row) => row.item },
  {
    id: 'qty',
    header: 'Qty',
    align: 'right',
    className: 'tabular-nums',
    stackAffix: { before: 'Qty ' },
    render: (row) => row.qty,
  },
  {
    id: 'price',
    header: 'Price',
    align: 'right',
    cardCorner: true,
    className: 'tabular-nums whitespace-nowrap',
    sortValue: (row) => row.price,
    render: (row) => <IskAmount value={row.price} decimals={0} />,
  },
  { id: 'system', header: 'System', render: (row) => row.system },
  {
    id: 'jumps',
    header: 'Jumps',
    align: 'right',
    className: 'tabular-nums',
    stackAffix: { before: 'Jumps ' },
    render: (row) => row.jumps,
  },
];

const SNAPSHOT_AT = new Date(Date.now() - 2 * 60 * 60 * 1000);

function ContractsItemSearch({ proposed }: { proposed: boolean }) {
  const { t } = useTranslation();
  const tabsId = useTabsId();
  const [belowMarket, setBelowMarket] = useState(proposed);
  const [query, setQuery] = useState(proposed ? '' : 'Rifter');
  const tabs = [
    { id: 'search/items', label: t('contracts.itemSearchTab') },
    { id: 'search/courier', label: t('contracts.courierTab') },
    { id: 'history', label: t('contracts.historyTab') },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-2 sm:space-y-4">
      <PageHeader
        title={t('contracts.title')}
        meta={<DataAgeBadge date={SNAPSHOT_AT} />}
        actions={<IconButton icon={<Icon.Refresh />} label={t('contractSearch.refresh')} />}
      />
      <Tabs
        tabsId={tabsId}
        tabs={tabs}
        value="search/items"
        onChange={() => undefined}
        label={t('contracts.tabsLabel')}
      />
      <TabPanel tabsId={tabsId} tabId="search/items" className="space-y-2 sm:space-y-4">
        <Panel padded={false} className="max-sm:-mx-2 max-sm:rounded-none max-sm:border-0">
          <FilterBar
            value={{}}
            onChange={() => undefined}
            activeCount={0}
            className="border-b border-line px-3 py-2"
            search={
              <SearchInput
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('contractSearch.searchPlaceholder')}
                className="min-w-32 flex-1"
              />
            }
            actions={
              proposed ? (
                // The label wraps to two lines over a chip this narrow.
                <div className="[&>[data-new-component]]:pt-9">
                  <NewComponent name="BelowMarketChip">
                    <FilterChip
                      label="Below market"
                      size="md"
                      selected={belowMarket}
                      onToggle={() => setBelowMarket((on) => !on)}
                      tooltip="One row per contract, valued at the trade hub's best buy, sorted by profit"
                    />
                  </NewComponent>
                </div>
              ) : null
            }
          >
            {() => null}
          </FilterBar>

          {proposed && belowMarket ? (
            <>
              <div className="px-3 pt-2">
                <NewComponent name="BelowMarketNote">
                  <p className="text-[0.6875rem] text-text-dim">
                    Contract snapshot 2h old · valued at Jita best buy minus sales tax · contracts
                    that ask for items, and auctions with no buyout, are left out
                  </p>
                </NewComponent>
              </div>
              <DataTable
                label="Below-market contracts"
                columns={contractColumns}
                rows={CONTRACTS}
                rowKey={(row) => row.id}
                defaultSort={{ columnId: 'profit', direction: 'desc' }}
                stackLayout="dense"
                mobileSort
                stackSummary={`${CONTRACTS.length} contracts below market`}
                onRowClick={() => undefined}
                rowMoreActions
              />
            </>
          ) : (
            <DataTable
              label={t('contractSearch.title')}
              columns={offerColumns}
              rows={OFFERS}
              rowKey={(row) => row.id}
              defaultSort={{ columnId: 'price', direction: 'asc' }}
              stackLayout="dense"
              mobileSort
              stackSummary={t('contractSearch.mobile.offerCount', { count: OFFERS.length })}
              onRowClick={() => undefined}
              rowMoreActions
            />
          )}
        </Panel>
      </TabPanel>
    </div>
  );
}

const meta = {
  title: 'mockups/ContractsBelowMarket',
  tags: ['!manifest'],
  parameters: { layout: 'fullscreen', shell: { path: '/contracts/search/items' } },
  render: () => <ContractsItemSearch proposed />,
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Proposed Contracts › Item search with "Below market" on: one row per contract, Value · Asking · Profit · Jumps, by Profit. New components: BelowMarketChip, BelowMarketNote. */
export const Proposed: Story = {};

/** @summary The proposal in the phone shell: dense two-line cards, Profit in the corner. */
export const ProposedPhone: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};

/** @summary Today's Item search for comparison: one row per item line (sample "Rifter" search). */
export const Today: Story = {
  render: () => <ContractsItemSearch proposed={false} />,
};

/** @summary Today's Item search in the phone shell. */
export const TodayPhone: Story = {
  render: () => <ContractsItemSearch proposed={false} />,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
