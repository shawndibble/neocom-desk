import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Button,
  DataTable,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  IconButton,
  IskAmount,
  Modal,
  Panel,
  StatChip,
  StatChips,
  TextArea,
  type DataTableColumn,
} from '@/components/ui';
import { figureOpenerClassName } from '@/components/ui/controlStyles';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import * as Icon from '@/components/ui/icons';
import type { AppraisalNetTotals, AppraisalTotals } from '@/engine/market/appraisal';
import { AppraisalHeaderStats } from '@/features/market/AppraisalHeaderStats';
import { AppraisalVolumeChip } from '@/features/market/AppraisalVolumeChip';
import { RefineChipValue } from '@/features/market/RefineChipValue';
import { cx } from '@/lib/cx';
import { useIsPhone } from '@/lib/useIsPhone';
import {
  FAILOVER,
  STEREO,
  STRATEGIC_INTEL,
  NOT_SIGNED_UP,
  PAYS_ONLY_IF_SHORT,
  PHONE,
  WAYPOINT_PERMISSION,
  WHY_MILITARY_CAMPAIGNS,
  WHY_WAYPOINTS,
  approxK,
  rewardSplit,
  rewardTotal,
  seedNoActiveCharacter,
  turnInShell,
  type TurnInItem,
  type TurnInState,
  type WriteState,
} from './campaignTurnInsFixtures';
import {
  MarketFrame,
  MaybeNew,
  PermissionCellMark,
  TurnInDetail,
  TurnInFigure,
} from './campaignTurnInsParts';
import { NewComponent } from './NewComponent';

/**
 * Campaign turn-ins on Market › Appraisal, placed where Refine sits today:
 *
 * - A **Turn in** total in the facts row beside Refine. Pressing the figure
 *   opens the `TurnInBreakdown` modal, as Refine's figure opens its breakdown.
 * - A **Turn in** column. Pressing a row's figure opens `TurnInDetail`.
 * - The actions menu's **Turn in** copy list, split per Item Trader.
 *
 * "Turn in" holds the items whose Turn-in Reward beats Sell now. LP is counted
 * at the issuing corporation's LP Value and paid per full 100 items. The
 * breakdown groups items by Item Trader (War HQ), with a subtotal, Set
 * destination and Copy list for each War HQ.
 *
 * New components in this mockup: `TurnInBreakdown` (the modal), `TurnInDetail`
 * (the row popover), `PermissionCellMark` (new reusable primitive), and the Turn
 * in chip, column and menu entries (dashed outline).
 */

interface Line {
  name: string;
  quantity: number;
  buy: number;
  sell: number;
  turnIn?: TurnInItem;
  refine?: number;
}

const LINES: readonly Line[] = [
  {
    name: FAILOVER.name,
    quantity: 300,
    buy: FAILOVER.jitaBuy,
    sell: FAILOVER.jitaSell,
    turnIn: FAILOVER,
  },
  { name: STEREO.name, quantity: 200, buy: STEREO.jitaBuy, sell: STEREO.jitaSell, turnIn: STEREO },
  {
    name: STRATEGIC_INTEL.name,
    quantity: 200,
    buy: STRATEGIC_INTEL.jitaBuy,
    sell: STRATEGIC_INTEL.jitaSell,
    turnIn: STRATEGIC_INTEL,
  },
  { name: 'Damage Control II', quantity: 12, buy: 1_041_000, sell: 1_089_000 },
  { name: 'Tritanium', quantity: 240_000, buy: 3.95, sell: 4.21 },
  { name: 'Compressed Veldspar', quantity: 5_000, buy: 1_510, sell: 1_640, refine: 8_120_000 },
];

const TURN_INS = LINES.filter((l) => l.turnIn);
const sum = (pick: (l: Line) => number) => LINES.reduce((s, l) => s + pick(l), 0);
const BUY = sum((l) => l.buy * l.quantity);
const SELL = sum((l) => l.sell * l.quantity);
const TOTALS: AppraisalTotals = {
  buy: BUY,
  sell: SELL,
  spread: SELL - BUY,
  unpricedRows: 0,
  refine: 8_120_000,
  refineSell: 8_400_000,
  refineUnpricedRows: 0,
  cheapestBuy: SELL,
  cheapestBuyViaLp: 0,
  volume: 9_812,
  volumeUnknownRows: 0,
};
const NET: AppraisalNetTotals = {
  instantNet: BUY * 0.955,
  listNet: SELL * 0.92,
  salesTaxPct: 4.5,
  brokerFeePct: 3.5,
};
const lineReward = (l: Line) => rewardTotal(l.turnIn!, l.quantity);
const TURN_IN_TOTAL = TURN_INS.reduce((s, l) => s + lineReward(l), 0);

const hqOf = (l: Line) => `${l.turnIn!.trader} · ${l.turnIn!.system}`;
/** The War HQs, in the order their first item was pasted. */
const WAR_HQS = [...new Set(TURN_INS.map(hqOf))].map((hq) => ({
  hq,
  lines: TURN_INS.filter((l) => hqOf(l) === hq),
}));

interface Options {
  state: TurnInState;
  write?: WriteState;
  /** Objectives the active Character has not pressed Participate on. */
  notSignedUp?: readonly number[];
  /** Opens one row's TurnInDetail. */
  openRow?: number;
  openBreakdown?: boolean;
  openMenu?: boolean;
  openMark?: boolean;
  today?: boolean;
}

const CHARACTER = 'Kestrel Vane';
const OUTLINE = 'rounded-xs outline-dashed outline-1 outline-offset-1 outline-warning';

function rowState(opts: Options, item: TurnInItem): TurnInState {
  if (opts.state === 'notSignedUp')
    return opts.notSignedUp?.includes(item.typeId) ? 'notSignedUp' : 'participating';
  return opts.state;
}

function ParticipateCell({ opts, item }: { opts: Options; item: TurnInItem }) {
  return rowState(opts, item) === 'participating' ? (
    <span className="inline-flex items-center gap-1 text-success">
      <Icon.Done size={Icon.ICON_SIZE.sm} aria-hidden="true" />
      Signed up
    </span>
  ) : (
    <span className="text-warning">{NOT_SIGNED_UP}</span>
  );
}

/** New component. The Turn in total's breakdown, grouped by War HQ. */
function TurnInBreakdown({ opts, open }: { opts: Options; open: boolean }) {
  const phone = useIsPhone();
  const knowsParticipate = opts.state === 'participating' || opts.state === 'notSignedUp';
  const write = opts.write ?? 'granted';
  const columns: DataTableColumn<Line>[] = [
    {
      id: 'item',
      header: 'Item',
      primary: true,
      render: (l) => <span className={entityLinkClassName('font-medium')}>{l.name}</span>,
    },
    {
      id: 'qty',
      header: 'Qty',
      align: 'right',
      className: 'tabular-nums',
      render: (l) => l.quantity.toLocaleString('en-US'),
    },
    {
      id: 'each',
      header: 'Each',
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      stackAffix: { after: ' each' },
      render: (l) =>
        phone ? (
          approxK(lineReward(l) / l.quantity)
        ) : (
          <span className="block">
            {approxK(lineReward(l) / l.quantity)}
            <span className="block text-[0.6875rem] text-text-dim">{rewardSplit(l.turnIn!)}</span>
          </span>
        ),
    },
    {
      id: 'total',
      header: 'Turned in',
      cardCorner: true,
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      render: (l) => (
        <span className="block">
          <span className="font-semibold">
            <IskAmount value={lineReward(l)} />
          </span>
          <span className="block text-[0.6875rem] text-isk-pos">
            +<IskAmount value={lineReward(l) - l.buy * l.quantity} /> over Sell now
          </span>
        </span>
      ),
    },
    {
      id: 'filled',
      header: 'Filled',
      align: 'right',
      className: 'tabular-nums',
      render: (l) => `${l.turnIn!.filledPct}%`,
    },
    ...(knowsParticipate
      ? [
          {
            id: 'participate',
            header: 'Participate',
            className: 'text-xs',
            render: (l: Line) => <ParticipateCell opts={opts} item={l.turnIn!} />,
          },
        ]
      : []),
  ];
  return (
    <Modal open={open} onClose={() => {}} title="Turn in: 39.6M" placement="wide">
      <NewComponent name="TurnInBreakdown">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-1 text-xs text-text-dim">
            <p>
              Items worth more handed to an Item Trader than sold now, grouped by War HQ. LP is paid
              per full 100 items, at each corporation&apos;s LP Value. + faction tokens, not
              counted.
            </p>
            {!knowsParticipate && (
              <div className="flex flex-wrap items-center gap-1">
                {PAYS_ONLY_IF_SHORT}
                {opts.state === 'missing' && (
                  <MaybeNew name="PermissionCellMark" labelled={false} inline>
                    <PermissionCellMark
                      character={CHARACTER}
                      why={WHY_MILITARY_CAMPAIGNS(CHARACTER)}
                      defaultOpen={opts.openMark}
                    />
                  </MaybeNew>
                )}
              </div>
            )}
          </div>
          {WAR_HQS.map(({ hq, lines }, i) => (
            <section key={hq} aria-label={hq} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <h3 className="flex items-center gap-1 text-sm font-semibold">
                  <Icon.Faction size={Icon.ICON_SIZE.sm} aria-hidden="true" />
                  {hq}
                </h3>
                <span className="text-sm font-semibold tabular-nums">
                  <IskAmount value={lines.reduce((s, l) => s + lineReward(l), 0)} />
                </span>
                <span className="flex-1" />
                <span className="flex flex-wrap items-center gap-1.5">
                  <Button size="sm" aria-disabled={write !== 'granted' || undefined}>
                    Set destination
                  </Button>
                  {write === 'missing' && (
                    <MaybeNew name="PermissionCellMark" labelled={false} inline>
                      <PermissionCellMark
                        character={CHARACTER}
                        permission={WAYPOINT_PERMISSION}
                        why={WHY_WAYPOINTS(CHARACTER)}
                        defaultOpen={opts.openMark && i === 0}
                      />
                    </MaybeNew>
                  )}
                  <Button size="sm">
                    <Icon.CopyToClipboard size={Icon.ICON_SIZE.sm} aria-hidden="true" />
                    Copy list
                  </Button>
                </span>
              </div>
              <div className="min-w-0 overflow-x-auto">
                <DataTable
                  columns={columns}
                  rows={lines}
                  rowKey={(l) => l.name}
                  label={hq}
                  stackLayout="dense"
                  density="compact"
                />
              </div>
            </section>
          ))}
        </div>
      </NewComponent>
    </Modal>
  );
}

function columns(opts: Options): DataTableColumn<Line>[] {
  const base: DataTableColumn<Line>[] = [
    {
      id: 'qty',
      header: 'Qty',
      align: 'right',
      className: 'tabular-nums',
      render: (l) => l.quantity.toLocaleString('en-US'),
    },
    {
      id: 'item',
      header: 'Item',
      primary: true,
      render: (l) => <span className={entityLinkClassName('font-medium')}>{l.name}</span>,
    },
    {
      id: 'buy',
      header: 'Buy total',
      align: 'right',
      className: 'tabular-nums',
      render: (l) => <IskAmount value={l.buy * l.quantity} />,
    },
    {
      id: 'sell',
      header: 'Sell total',
      align: 'right',
      className: 'tabular-nums',
      render: (l) => <IskAmount value={l.sell * l.quantity} />,
    },
    {
      id: 'refine',
      header: 'Refine',
      align: 'right',
      className: 'tabular-nums',
      render: (l) =>
        l.refine ? (
          <button type="button" className={cx(figureOpenerClassName, 'relative')}>
            <IskAmount value={l.refine} />
          </button>
        ) : (
          <span className="text-text-dim">—</span>
        ),
    },
  ];
  if (opts.today) return base;
  return [
    ...base,
    {
      id: 'turnIn',
      header: 'Turn in',
      headerClassName: OUTLINE,
      align: 'right',
      className: 'tabular-nums',
      render: (l) => {
        const item = l.turnIn;
        if (!item) return <span className="text-text-dim">—</span>;
        return (
          <TurnInDetail
            item={item}
            character={CHARACTER}
            state={rowState(opts, item)}
            write={opts.write}
            extra={`${l.quantity} in this list · ${approxK(lineReward(l))} turned in`}
            defaultOpen={opts.openRow === item.typeId}
            trigger={
              <TurnInFigure label={`Turn-in reward for ${item.name}`}>
                {approxK(lineReward(l))}
              </TurnInFigure>
            }
          />
        );
      },
    },
  ];
}

function ActionsMenu({ opts }: { opts: Options }) {
  const count = (n: number) => <span className="ml-auto pl-3 text-text-dim tabular-nums">{n}</span>;
  return (
    <DropdownMenu defaultOpen={opts.openMenu}>
      <DropdownMenuTrigger asChild>
        <IconButton size="sm" icon={<Icon.More />} label="Appraisal actions" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="bottom" avoidCollisions={false}>
        <DropdownMenuItem>Sell now{count(1)}</DropdownMenuItem>
        <DropdownMenuItem>List at undercut{count(1)}</DropdownMenuItem>
        <DropdownMenuItem>Refine{count(1)}</DropdownMenuItem>
        {!opts.today && (
          <DropdownMenuSub open={opts.openMenu ? true : undefined}>
            <DropdownMenuSubTrigger className={OUTLINE}>
              Turn in {count(TURN_INS.length)}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {WAR_HQS.map(({ hq, lines }) => (
                <DropdownMenuItem key={hq}>
                  {hq}
                  {count(lines.length)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        <DropdownMenuItem>Multibuy{count(LINES.length)}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>Download CSV</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const PASTE = LINES.map((l) => `${l.name}\t${l.quantity}`).join('\n');

function AppraisalMockup(opts: Options) {
  const phone = useIsPhone();
  return (
    <MarketFrame tab="appraisal">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start xl:grid-cols-[18rem_minmax(0,1fr)]">
        {phone ? (
          <button
            type="button"
            className="flex items-center justify-between rounded-xs border border-line bg-panel px-3 py-2 text-left text-sm"
          >
            <span>6 lines · Edit list</span>
            <span className="text-text-dim">Jita · 100%</span>
          </button>
        ) : (
          <Panel title="Paste">
            <div className="flex flex-col gap-3">
              <TextArea
                aria-label="Items from inventory, multibuy or a fitting"
                rows={7}
                mono
                className="text-[0.6875rem]"
                defaultValue={PASTE}
              />
              <div className="flex flex-wrap gap-2">
                <Button variant="primary">Appraise</Button>
                <Button>Clear</Button>
              </div>
            </div>
          </Panel>
        )}
        <div className="flex min-w-0 flex-col gap-2">
          {/* The real header's own facts row is hidden; the one below adds the Turn in chip. */}
          <div className="[&>div>*:nth-child(2)]:hidden">
            <AppraisalHeaderStats
              totals={TOTALS}
              net={NET}
              itemCount={LINES.length}
              showRefine
              refineValue={TOTALS.refine}
              refineBasis="buy"
              showCheapest={false}
              implantBonusPct={0}
            />
          </div>
          <StatChips>
            <AppraisalVolumeChip totals={TOTALS} />
            <StatChip label="Items" value={LINES.length} />
            <StatChip
              label="Refine"
              value={
                <RefineChipValue
                  amount={<IskAmount value={TOTALS.refine} decimals={0} />}
                  basis="buy"
                  efficiency="68.3%"
                  onOpen={() => {}}
                />
              }
            />
            {!opts.today && (
              <span className={OUTLINE}>
                <StatChip
                  label="Turn in"
                  tone="accent"
                  value={
                    <span className="inline-flex items-center gap-1">
                      <button type="button" className={cx(figureOpenerClassName, 'relative')}>
                        <span className="sr-only">Open the Turn in breakdown </span>
                        <IskAmount value={TURN_IN_TOTAL} decimals={0} />
                      </button>
                      <span className="font-normal text-text-dim">{TURN_INS.length} items</span>
                    </span>
                  }
                />
              </span>
            )}
          </StatChips>
          <Panel title="Appraisal" padded={false} actions={<ActionsMenu opts={opts} />}>
            <div className="min-w-0 overflow-x-auto">
              <DataTable
                columns={columns(opts)}
                rows={LINES}
                rowKey={(l) => l.name}
                label="Appraisal"
                responsive="table"
              />
            </div>
          </Panel>
        </div>
      </div>
      {!opts.today && <TurnInBreakdown opts={opts} open={opts.openBreakdown ?? false} />}
    </MarketFrame>
  );
}

const meta = {
  title: 'mockups/CampaignTurnIns/Appraisal',
  tags: ['!manifest'],
  parameters: { layout: 'fullscreen', shell: turnInShell('/market/appraisal') },
  render: () => <AppraisalMockup state="participating" />,
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const NOT_SIGNED = [STEREO.typeId, STRATEGIC_INTEL.typeId];

/** @summary Today: Volume, Items and Refine; no Turn in chip or column. */
export const Today: Story = { render: () => <AppraisalMockup state="participating" today /> };

/** @summary Turn in total beside Refine (opens the breakdown) and a Turn in column (each figure opens TurnInDetail). */
export const Proposed: Story = {};

/** @summary A row's Turn in figure pressed: TurnInDetail for that item, signed up. */
export const RowDetail: Story = {
  render: () => <AppraisalMockup state="participating" openRow={FAILOVER.typeId} />,
};

/** @summary Not signed up for that objective: the popover's warning line. */
export const RowDetailNotSignedUp: Story = {
  render: () => (
    <AppraisalMockup state="notSignedUp" notSignedUp={NOT_SIGNED} openRow={STEREO.typeId} />
  ),
};

/** @summary Military Campaigns missing: the plain caveat with the amber mark inside the popover. */
export const RowDetailPermissionMissing: Story = {
  render: () => <AppraisalMockup state="missing" openRow={FAILOVER.typeId} />,
};

/** @summary Military Campaigns dismissed: the plain caveat, no mark. */
export const RowDetailDismissed: Story = {
  render: () => <AppraisalMockup state="dismissed" openRow={FAILOVER.typeId} />,
};

/** @summary No active Character: the plain caveat; Set destination disabled. */
export const RowDetailNoCharacter: Story = {
  parameters: { shell: turnInShell('/market/appraisal', seedNoActiveCharacter) },
  render: () => (
    <AppraisalMockup state="noCharacter" write="noCharacter" openRow={FAILOVER.typeId} />
  ),
};

/** @summary The Turn in total pressed: TurnInBreakdown grouped by War HQ, with a subtotal, Set destination and Copy list for each. */
export const Breakdown: Story = {
  render: () => <AppraisalMockup state="participating" openBreakdown />,
};

/** @summary Breakdown, not signed up for two objectives: the Participate column names them. */
export const BreakdownNotSignedUp: Story = {
  render: () => <AppraisalMockup state="notSignedUp" notSignedUp={NOT_SIGNED} openBreakdown />,
};

/** @summary Breakdown, Military Campaigns missing: no Participate column; the caveat with one amber mark, opened. */
export const BreakdownPermissionMissing: Story = {
  render: () => <AppraisalMockup state="missing" openBreakdown openMark />,
};

/** @summary Breakdown, Autopilot waypoints missing: Set destination aria-disabled with a mark after it (first one opened). */
export const BreakdownWaypointsMissing: Story = {
  render: () => <AppraisalMockup state="participating" write="missing" openBreakdown openMark />,
};

/** @summary The actions menu: the Turn in copy list splits per Item Trader. */
export const CopyMenu: Story = { render: () => <AppraisalMockup state="participating" openMenu /> };

/** @summary Today on a phone. */
export const TodayPhone: Story = {
  globals: PHONE,
  render: () => <AppraisalMockup state="participating" today />,
};

/** @summary Proposed on a phone: the chip wraps in the facts row; the table scrolls sideways as today. */
export const ProposedPhone: Story = { globals: PHONE };

/** @summary A row's TurnInDetail on a phone, Military Campaigns missing. */
export const RowDetailPhone: Story = {
  globals: PHONE,
  render: () => <AppraisalMockup state="missing" openRow={FAILOVER.typeId} />,
};

/** @summary The breakdown on a phone. */
export const BreakdownPhone: Story = {
  globals: PHONE,
  render: () => <AppraisalMockup state="notSignedUp" notSignedUp={NOT_SIGNED} openBreakdown />,
};
