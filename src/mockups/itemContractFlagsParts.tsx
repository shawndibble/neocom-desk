import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataAgeBadge,
  DataTable,
  Eyebrow,
  Field,
  Fields,
  FilterBar,
  FilterChip,
  IconButton,
  IskAmount,
  PageHeader,
  Panel,
  SearchInput,
  SlideOver,
  StatChip,
  StatChips,
  Tabs,
  Tooltip,
  TypeIcon,
  useTabsId,
} from '@/components/ui';
import { Pill } from '@/components/ui/Pill';
import * as Icon from '@/components/ui/icons';
import { ContractPriceCheck } from '@/features/contracts/ContractPriceCheck';
import { useItemsColumns } from '@/features/contractSearch/useItemsColumns';
import { CONTRACT_SEARCH_ITEMS_COLUMN_IDS } from '@/features/contractSearch/contractSearchItemsColumns';
import type { PublicContractOfferRow } from '@/engine/contracts/contractOffers';
import { formatCount } from '@/lib/formatCount';
import { formatIskAuto, CONTRACT_ISK_CENTS_BELOW } from '@/lib/isk';
import { NewComponent } from './NewComponent';
import {
  HUB_NAME,
  HUB_SELL,
  JUMPS_FROM_PILOT,
  LINE_COUNT,
  OFFER_LOCATIONS,
  ORIGINAL_HUB_PRICE,
  REGION_NAMES,
  TYPE_NAMES,
  flagFor,
  type RowFlag,
} from './itemContractFlagsFixtures';

/** The snapshot's age, fixed at load so the badge does not move between renders. */
const SYNCED_AT = new Date(Date.now() - 14 * 60_000);

const isk = (value: number) => formatIskAuto(value, CONTRACT_ISK_CENTS_BELOW);

/** The flag's words: the tooltip and the icon's accessible name (never colour alone). */
function flagSentence(flag: NonNullable<RowFlag>): string {
  return flag.kind === 'overpriced'
    ? `Asks ${formatCount(flag.multiple)} times the ${HUB_NAME} sell price.`
    : `Asks more than the original sells for at ${HUB_NAME} (${isk(flag.original)}). A copy is the cheaper way in.`;
}

/**
 * `BaitFlag`'s look on a contract: the same Warn glyph in `text-warning` before
 * the price, the sentence as tooltip and accessible name. New because
 * `BaitFlag` words itself for a sell order ("N times the best sell").
 */
function ContractFlag({ flag }: { flag: NonNullable<RowFlag> }) {
  const sentence = flagSentence(flag);
  return (
    <Tooltip content={sentence}>
      <span
        tabIndex={0}
        role="img"
        aria-label={
          flag.kind === 'overpriced'
            ? 'Priced far above market'
            : 'Copy asks more than the original'
        }
        className="mr-1 inline-flex align-text-bottom text-warning"
      >
        <Icon.Warn aria-hidden size={Icon.ICON_SIZE.sm} />
      </span>
    </Tooltip>
  );
}

interface BoardProps {
  search: string;
  rows: readonly PublicContractOfferRow[];
  /** The proposal: markers on the price cell and the Hide overpriced chip. */
  flags: boolean;
  hideOverpriced?: boolean;
  threshold: number;
  /** The row-level bundle hint: a dim "9 lines" under the price of a multi-line contract. */
  bundleHint?: boolean;
}

/**
 * The Items board as `ContractSearchPanel` draws it: today's columns from
 * `useItemsColumns`, with the Price cell wrapped by the proposed marker. The
 * panel's own data loading is replaced by the sample rows.
 */
export function ItemsBoard({
  search,
  rows,
  flags,
  hideOverpriced = false,
  threshold,
  bundleHint = false,
}: BoardProps) {
  const { t } = useTranslation();
  const tabsId = useTabsId();
  const [hide, setHide] = useState(hideOverpriced);
  const [belowMarket, setBelowMarket] = useState(false);

  const { columns } = useItemsColumns({
    typeNames: TYPE_NAMES,
    regionNames: REGION_NAMES,
    offerLocations: OFFER_LOCATIONS,
    jumpRangeFilter: {
      jumpsStatus: 'ready',
      jumps: JUMPS_FROM_PILOT,
    } as unknown as Parameters<typeof useItemsColumns>[0]['jumpRangeFilter'],
    plexPrice: null,
    visibleItemsColumns: CONTRACT_SEARCH_ITEMS_COLUMN_IDS,
  });

  const flagged = useMemo(
    () => new Map(rows.map((row) => [row.contractId, flags ? flagFor(row, threshold) : null])),
    [rows, flags, threshold]
  );
  const hiddenCount = [...flagged.values()].filter((flag) => flag !== null).length;
  const shown = flags && hide ? rows.filter((row) => flagged.get(row.contractId) === null) : rows;

  const tableColumns = useMemo(
    () =>
      columns.map((column) => {
        if (column.id !== 'price') return column;
        return {
          ...column,
          render: (row: PublicContractOfferRow) => {
            const flag = flagged.get(row.contractId) ?? null;
            const lines = LINE_COUNT.get(row.contractId) ?? 1;
            return (
              <>
                {flag && <ContractFlag flag={flag} />}
                <IskAmount value={row.price} />
                {bundleHint && lines > 1 && (
                  <span className="block text-[0.625rem] text-text-dim">{lines} lines</span>
                )}
              </>
            );
          },
        };
      }),
    [columns, flagged, bundleHint]
  );

  const prices = shown.map((row) => row.price).sort((a, b) => a - b);
  const median = prices.length ? prices[Math.floor(prices.length / 2)] : null;

  return (
    <div className="mx-auto max-w-6xl space-y-2 sm:space-y-4">
      <PageHeader
        title="Contracts"
        meta={<DataAgeBadge date={SYNCED_AT} />}
        actions={<IconButton icon={<Icon.Refresh />} label="Refresh" onClick={() => undefined} />}
      />
      <Tabs
        tabsId={tabsId}
        tabs={[
          { id: 'history', label: 'History' },
          { id: 'search/items', label: 'Item search' },
          { id: 'search/courier', label: 'Courier' },
        ]}
        value="search/items"
        onChange={() => undefined}
        label="Contracts"
      />
      <Panel padded={false} className="max-sm:-mx-2 max-sm:rounded-none max-sm:border-0">
        <FilterBar
          value={{ hideOverpriced: hide }}
          onChange={(next) => setHide(next.hideOverpriced)}
          activeCount={flags && hide ? 1 : 0}
          className="border-b border-line px-3 py-2"
          search={
            <SearchInput
              value={search}
              onChange={() => undefined}
              placeholder="Search for an item"
              className="min-w-48 flex-1"
            />
          }
          actions={
            <FilterChip
              label="Below market"
              size="md"
              selected={belowMarket}
              onToggle={() => setBelowMarket(!belowMarket)}
            />
          }
        >
          {(draft, setDraft) =>
            flags ? (
              <FilterChip
                label="Hide overpriced"
                selected={draft.hideOverpriced}
                onToggle={() => setDraft({ hideOverpriced: !draft.hideOverpriced })}
                tooltip={`Hides item contracts flagged as priced far above ${HUB_NAME}: ${threshold} times the hub sell for an item, or a copy asking more than its original. Contracts with other lines are never hidden.`}
              />
            ) : (
              <span className="px-1 text-text-dim">
                Region, price, quantity and the other filters
              </span>
            )
          }
        </FilterBar>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
          <StatChips>
            <StatChip label="Offers" value={String(shown.length)} />
            <StatChip
              label="Cheapest"
              value={prices.length ? <IskAmount value={prices[0]} /> : '—'}
            />
            <StatChip label="Median" value={median === null ? '—' : <IskAmount value={median} />} />
          </StatChips>
          {flags && hide && hiddenCount > 0 && (
            <span className="text-[0.6875rem] text-text-dim">
              {hiddenCount} overpriced {hiddenCount === 1 ? 'contract' : 'contracts'} hidden
            </span>
          )}
          <Button size="sm" onClick={() => undefined}>
            Clear item
          </Button>
        </div>
        <DataTable
          label={t('contractSearch.title')}
          columns={tableColumns}
          rows={shown}
          rowKey={(row) => row.contractId}
          onRowClick={() => undefined}
          defaultSort={{ columnId: 'price', direction: 'asc' }}
          stackLayout="dense"
          mobileSort
          stackSummary={`${shown.length} offers`}
        />
      </Panel>
    </div>
  );
}

export type ModalCase = 'overpriced' | 'copy' | 'bundle';

const MODAL = {
  overpriced: {
    title: 'Damage Control II',
    contractId: 191_000_003,
    chips: [
      ['Price', '6.2M ISK'],
      ['Qty', '1'],
    ],
    lines: [{ typeId: 2048, name: 'Damage Control II', qty: 1, tag: true }],
    rows: [
      { label: 'Asking price', value: '6,200,000 ISK' },
      { label: 'Contents at Jita sell', value: '412,000 ISK' },
      { label: 'Difference', value: '+5,788,000 ISK', note: 'Asking is above sell orders' },
    ],
    sentence: `Asks 15 times the ${HUB_NAME} sell price (412,000 ISK each). Buying it at the hub instead saves about 5.8M ISK.`,
    region: 'Domain',
    system: 'Amarr',
  },
  copy: {
    title: 'Damage Control II Blueprint',
    contractId: 192_000_002,
    chips: [
      ['Price', '9.4M ISK'],
      ['Qty', '1'],
      ['ME / TE', '2 / 4'],
      ['Runs', '5'],
    ],
    lines: [{ typeId: 2049, name: 'Damage Control II Blueprint', qty: 1, copy: true }],
    rows: [
      { label: 'This copy, per run', value: '1.88M ISK' },
      {
        label: 'Original at Jita',
        value: `${isk(ORIGINAL_HUB_PRICE)} ISK`,
        note: 'one-off price, unlimited runs',
      },
    ],
    sentence: `Asks 9.4M ISK for a copy with 5 runs. The original sells for ${isk(ORIGINAL_HUB_PRICE)} ISK at ${HUB_NAME} and has unlimited runs, so the original is the cheaper blueprint.`,
    region: 'Domain',
    system: 'Amarr',
  },
  bundle: {
    title: 'Damage Control II',
    contractId: 191_000_006,
    chips: [
      ['Price', '4.1M ISK'],
      ['Qty', '1'],
    ],
    lines: [
      { typeId: 2048, name: 'Damage Control II', qty: 1, tag: true },
      { typeId: 3841, name: 'Large Shield Extender II', qty: 4 },
      { typeId: 2281, name: 'Multispectrum Shield Hardener II', qty: 4 },
    ],
    more: '6 more lines',
    rows: [
      { label: 'Asking price', value: '4,100,000 ISK' },
      { label: 'Your search', value: '412,000 ISK', note: '1 line you searched for' },
      { label: 'Other items', value: '46,200,000 ISK', note: '8 lines you did not search for' },
      { label: 'Difference', value: '−42,512,000 ISK', note: 'Asking is below sell orders' },
    ],
    sentence: `Damage Control II is 1% of this contract's value at ${HUB_NAME} sell. The price pays for 8 other lines.`,
    region: 'Metropolis',
    system: 'Hek',
  },
} as const;

/**
 * The detail slide-over with the proposed flag sentence beside the price
 * check. The body is composed from the same pieces as
 * `PublicContractDetailModal` (stat chips, item lines, `ContractPriceCheck`)
 * with sample figures: the real one loads its lines and prices when it opens.
 */
export function ProposedContractModal({ which }: { which: ModalCase }) {
  const data = MODAL[which];
  const more = 'more' in data ? data.more : null;
  return (
    <SlideOver
      open
      onClose={() => undefined}
      maxWidthClassName="max-w-[28rem]"
      title={
        <span className="flex flex-wrap items-center gap-2">
          {data.title}
          <Pill>Public</Pill>
        </span>
      }
      subtitle={<span className="tabular-nums">{data.contractId}</span>}
    >
      <div className="flex flex-col gap-5 text-xs">
        <StatChips>
          {data.chips.map(([label, value], index) => (
            <StatChip key={label} emphasis={index === 0} label={label} value={value} />
          ))}
          <StatChip label="Expires" value="Oct 26, 14:02" />
        </StatChips>
        <div>
          <Eyebrow>Contents</Eyebrow>
          <ul className="mt-1.5 flex flex-col gap-1">
            {data.lines.map((line) => (
              <li
                key={line.typeId}
                className="flex items-center gap-2 rounded-xs border border-line bg-panel-2 px-2 py-1.5 text-sm"
              >
                <TypeIcon
                  typeId={line.typeId}
                  size={32}
                  width={24}
                  height={24}
                  className="shrink-0 rounded-xs border border-line"
                />
                <span className="min-w-0 flex-1 truncate">{line.name}</span>
                {'tag' in line && <Pill tone="success">Your search</Pill>}
                <span className="shrink-0 tabular-nums">×{line.qty}</span>
              </li>
            ))}
            {more && <li className="px-2 text-text-dim">{more}</li>}
          </ul>
        </div>
        <ContractPriceCheck
          heading={
            which === 'copy'
              ? 'Is it fair? · Copy against original'
              : `Is it fair? · ${HUB_NAME} right now`
          }
          rows={data.rows}
        />
        <NewComponent name="ContractFlagNote">
          <p className="flex items-start gap-2 text-sm">
            <span className="mt-0.5 shrink-0 text-warning">
              <Icon.Warn aria-hidden size={Icon.ICON_SIZE.sm} />
            </span>
            <span>
              {data.sentence}
              {which !== 'bundle' && (
                <span className="block text-text-dim">
                  Flag threshold: 10 times. Change it in Settings › Market.
                </span>
              )}
            </span>
          </p>
        </NewComponent>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-text-dim">Region</dt>
          <dd>{data.region}</dd>
          <dt className="text-text-dim">System</dt>
          <dd>{data.system}</dd>
        </dl>
      </div>
    </SlideOver>
  );
}

/** Settings › Market, beside "Flag courier collateral at": the proposed threshold row. */
export function ThresholdSettingsRow() {
  const [selected, setSelected] = useState(10);
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 pt-4">
      <NewComponent name="Flag item contracts at row (the second row)">
        <Panel title="Market defaults">
          <Fields>
            <Field
              label="Flag courier collateral at"
              note="Flags a courier contract whose collateral is this many times its reward."
            >
              <div
                role="group"
                aria-label="Flag courier collateral at"
                className="flex flex-wrap gap-2"
              >
                {[20, 50, 100, 200].map((n) => (
                  <FilterChip
                    key={n}
                    label={`${n}×`}
                    selected={n === 50}
                    onToggle={() => undefined}
                  />
                ))}
              </div>
            </Field>
            <Field
              label="Flag item contracts at"
              note="Flags an item contract asking this many times the hub sell price. Blueprint copies are flagged when they ask more than the original, whatever this says."
            >
              <div
                role="group"
                aria-label="Flag item contracts at"
                className="flex flex-wrap gap-2"
              >
                {[5, 10, 20, 50].map((n) => (
                  <FilterChip
                    key={n}
                    label={`${n}×`}
                    selected={n === selected}
                    onToggle={() => setSelected(n)}
                  />
                ))}
              </div>
            </Field>
          </Fields>
        </Panel>
      </NewComponent>
    </div>
  );
}

export { HUB_SELL };
