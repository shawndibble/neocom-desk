import type { ReactElement } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  DataTable,
  IskAmount,
  Panel,
  SegmentedControl,
  type DataTableColumn,
} from '@/components/ui';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { CharacterBadge } from '@/features/assets/assetBrowserRows';
import { OrderProblemBadge, type OrderBadgeKind } from '@/features/market/OrderProblemBadge';
import { formatIsk } from '@/lib/isk';
import { useIsPhone } from '@/lib/useIsPhone';
import {
  CHARACTERS,
  FAILOVER,
  FLUX_LOG,
  STEREO,
  STRATEGIC_INTEL,
  PHONE,
  approxK,
  rewardEach,
  seedThreeCharacters,
  turnInShell,
  type MockCharacter,
  type TurnInItem,
  type TurnInState,
} from './campaignTurnInsFixtures';
import {
  MarketFrame,
  MaybeNew,
  TurnInDetail,
  TurnInFigure,
  TurnInGlyph,
} from './campaignTurnInsParts';

/**
 * Campaign turn-ins on Market › Open. No extra line under any order.
 *
 * - A SELL order on a turn-in item whose Turn-in Reward beats its price shows
 *   a new, lowest-precedence state in What's wrong: **TURN IN +2k each**. It
 *   sits in the Watch bucket and never counts toward "N orders need you". Do
 *   this reads **Turn in instead**, which opens `TurnInDetail`. A real problem
 *   (undercut, expiring…) still wins the column (Stereo-Collapse Signal).
 * - A BUY order on a turn-in item keeps its badge (Top bid / Outbid). A small
 *   dim glyph after its price opens `TurnInDetail` with "Pays you ~950k per 100
 *   over this bid".
 *
 * Rows belong to three Characters. Kestrel Vane is signed up, Orsa Tellemar is
 * granted but not signed up, and Mira Solenne lacks Military Campaigns. The
 * popover's Participate line and grant mark are for the row's Character.
 *
 * New components in this mockup: `TurnInOrderBadge` (the TURN IN state),
 * `TurnInDetail`, `PermissionCellMark` (inside the popover), and the "Turn in
 * instead" and glyph triggers.
 */

interface OrderRow {
  id: number;
  name: string;
  turnIn?: TurnInItem;
  isBuy: boolean;
  station: string;
  character: MockCharacter;
  price: number;
  badge?: OrderBadgeKind;
  badgeDetail?: string;
  doThis?: string;
  tiedUp: number;
}

const ROWS: readonly OrderRow[] = [
  {
    id: 1,
    name: 'Damage Control II',
    isBuy: false,
    station: 'Jita 4-4',
    character: CHARACTERS.kestrel,
    price: 1_124_000,
    badge: 'undercutStation',
    badgeDetail: '-3.1%',
    doThis: 'Undercut to 1,089,000',
    tiedUp: 13_488_000,
  },
  {
    id: 2,
    name: FAILOVER.name,
    turnIn: FAILOVER,
    isBuy: false,
    station: 'Jita 4-4',
    character: CHARACTERS.kestrel,
    price: 57_990,
    tiedUp: 8_698_500,
  },
  {
    id: 3,
    name: STEREO.name,
    turnIn: STEREO,
    isBuy: false,
    station: 'Jita 4-4',
    character: CHARACTERS.orsa,
    price: 58_900,
    badge: 'undercutStation',
    badgeDetail: '-0.7%',
    doThis: 'Undercut to 58,490',
    tiedUp: 4_712_000,
  },
  {
    id: 4,
    name: STRATEGIC_INTEL.name,
    turnIn: STRATEGIC_INTEL,
    isBuy: true,
    station: 'Jita 4-4',
    character: CHARACTERS.mira,
    price: 38_500,
    badge: 'topBid',
    doThis: 'Leave it alone',
    tiedUp: 11_550_000,
  },
  {
    id: 5,
    name: FLUX_LOG.name,
    turnIn: FLUX_LOG,
    isBuy: false,
    station: 'Amarr VIII',
    character: CHARACTERS.mira,
    price: 47_000,
    tiedUp: 4_700_000,
  },
  {
    id: 6,
    name: 'Tritanium',
    isBuy: true,
    station: 'Jita 4-4',
    character: CHARACTERS.orsa,
    price: 3.98,
    badge: 'outbid',
    doThis: 'Bid 4.13',
    tiedUp: 71_640_000,
  },
];

interface Options {
  /** Every row in one state; unset, each row follows its Character. */
  force?: TurnInState;
  /** Opens this order's TurnInDetail. */
  open?: number;
  today?: boolean;
}

/** A SELL order whose turn-in beats its price, with no real problem: the Turn in state. */
const turnInState = (row: OrderRow) =>
  !row.isBuy && row.turnIn && !row.badge && rewardEach(row.turnIn) > row.price;

function Detail({ row, opts, trigger }: { row: OrderRow; opts: Options; trigger: ReactElement }) {
  const item = row.turnIn!;
  return (
    <TurnInDetail
      item={item}
      character={row.character.name}
      state={opts.force ?? row.character.state}
      extra={
        row.isBuy
          ? `Pays you ${approxK((rewardEach(item) - row.price) * 100)} per 100 over this bid (${formatIsk(row.price, 0)})`
          : `Pays ${approxK(rewardEach(item) - row.price)} each over your price (${formatIsk(row.price, 0)})`
      }
      defaultOpen={opts.open === row.id}
      trigger={trigger}
    />
  );
}

function Problem({ row, opts }: { row: OrderRow; opts: Options }) {
  if (!opts.today && turnInState(row)) {
    return (
      <MaybeNew name="TurnInOrderBadge" labelled={row.id === 2} inline>
        <span className="inline-flex items-center gap-1 rounded-xs bg-panel-2 px-1.5 py-0.5 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
          Turn in
          <span className="tracking-normal normal-case">
            +{approxK(rewardEach(row.turnIn!) - row.price).slice(1)} each
          </span>
        </span>
      </MaybeNew>
    );
  }
  const badge = row.badge ?? 'best';
  return <OrderProblemBadge kind={badge} detail={row.badgeDetail} interactive={false} />;
}

function DoThis({ row, opts }: { row: OrderRow; opts: Options }) {
  if (!opts.today && turnInState(row))
    return (
      <Detail
        row={row}
        opts={opts}
        trigger={<TurnInFigure label={`${row.name}:`}>Turn in instead</TurnInFigure>}
      />
    );
  return <>{row.doThis ?? 'Leave it alone'}</>;
}

function Price({ row, opts }: { row: OrderRow; opts: Options }) {
  return (
    <span className="inline-flex items-center whitespace-nowrap tabular-nums">
      {formatIsk(row.price, row.price < 100 ? 2 : 0)}
      {!opts.today && row.isBuy && row.turnIn && (
        <Detail
          row={row}
          opts={opts}
          trigger={<TurnInGlyph label={`Turn-in reward for ${row.name}`} />}
        />
      )}
    </span>
  );
}

function columns(opts: Options): DataTableColumn<OrderRow>[] {
  return [
    {
      id: 'item',
      header: 'Item',
      primary: true,
      render: (row) => (
        <span className="block min-w-0">
          <span className={entityLinkClassName('font-medium')}>{row.name}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-text-dim">
            <span className="whitespace-nowrap">
              {row.station}
              {row.isBuy && ' · Buy order'}
            </span>
            <span className="-ml-1.5">
              <CharacterBadge characterName={row.character.name} />
            </span>
          </span>
        </span>
      ),
    },
    {
      id: 'problem',
      header: "What's wrong",
      className: 'whitespace-nowrap',
      render: (row) => <Problem row={row} opts={opts} />,
    },
    {
      id: 'doThis',
      header: 'Do this',
      className: 'font-semibold',
      render: (row) => <DoThis row={row} opts={opts} />,
    },
    {
      id: 'price',
      header: 'Your price',
      align: 'right',
      render: (row) => <Price row={row} opts={opts} />,
    },
    {
      id: 'iskTiedUp',
      header: 'ISK tied up',
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      render: (row) => <IskAmount value={row.tiedUp} />,
    },
  ];
}

/** Below `sm` the real page lists dense cards (`OpenOrdersList`). */
function PhoneList({ opts }: { opts: Options }) {
  return (
    <ul aria-label="All orders" className="divide-y divide-line">
      {ROWS.map((row) => (
        <li key={row.id} className="px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className={entityLinkClassName('min-w-0 truncate font-medium')}>{row.name}</span>
            <Problem row={row} opts={opts} />
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1 text-xs">
            <span className="font-semibold">
              <DoThis row={row} opts={opts} />
            </span>
            {row.isBuy && (
              <span className="text-text-dim">
                · your bid <Price row={row} opts={opts} />
              </span>
            )}
            <CharacterBadge characterName={row.character.name} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function OpenOrdersMockup(opts: Options) {
  const phone = useIsPhone();
  const watch = opts.today ? 0 : 2;
  return (
    <MarketFrame tab="orders">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-lg font-semibold">3 orders need you</h2>
        <span className="text-xs text-text-dim">
          {watch > 0 ? `${watch} to watch · ` : ''}
          {6 - 3 - watch} fine · 114M ISK tied up
        </span>
      </div>
      <SegmentedControl
        label="Which orders"
        value="all"
        onChange={() => {}}
        options={[
          { value: 'act', label: 'Needs you (3)' },
          { value: 'watch', label: `Watch (${watch})` },
          { value: 'all', label: 'All (6)' },
        ]}
      />
      <Panel title="All orders" padded={false}>
        {phone ? (
          <PhoneList opts={opts} />
        ) : (
          <DataTable
            columns={columns(opts)}
            rows={ROWS}
            rowKey={(row) => row.id}
            label="All orders"
            responsive="table"
          />
        )}
      </Panel>
    </MarketFrame>
  );
}

const meta = {
  title: 'mockups/CampaignTurnIns/OpenOrders',
  tags: ['!manifest'],
  parameters: {
    layout: 'fullscreen',
    shell: turnInShell('/market/orders', seedThreeCharacters),
  },
  render: () => <OpenOrdersMockup />,
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Today: the same orders; the turn-in SELL orders read Best price. */
export const Today: Story = { render: () => <OpenOrdersMockup today /> };

/**
 * @summary Three Characters: TURN IN +2k each on Kestrel's Failover sell (Watch), a real undercut
 * winning on Orsa's Stereo sell, the glyph after Mira's buy price. Kestrel's Turn in instead is open.
 */
export const Mixed: Story = { render: () => <OpenOrdersMockup open={2} /> };

/** @summary Mira's buy order glyph pressed: pays you ~950k per 100 over this bid; Military Campaigns missing, mark inside. */
export const PermissionMissing: Story = { render: () => <OpenOrdersMockup open={4} /> };

/** @summary Mira's sell (Flux Log) with Military Campaigns dismissed: the plain caveat, no mark. */
export const Dismissed: Story = {
  render: () => <OpenOrdersMockup open={5} force="dismissed" />,
};

/** @summary Today in the phone shell. */
export const TodayPhone: Story = { globals: PHONE, render: () => <OpenOrdersMockup today /> };

/** @summary Mixed in the phone shell's dense cards. */
export const MixedPhone: Story = { globals: PHONE };

/** @summary Phone: Mira's Flux Log Turn in instead pressed, Military Campaigns missing. */
export const PermissionMissingPhone: Story = {
  globals: PHONE,
  render: () => <OpenOrdersMockup open={5} />,
};
