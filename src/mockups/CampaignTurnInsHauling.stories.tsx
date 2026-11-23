import type { Meta, StoryObj } from '@storybook/react-vite';
import { DataTable, IskAmount, Panel, type DataTableColumn } from '@/components/ui';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { formatIsk } from '@/lib/isk';
import { FAILOVER, PHONE, turnInShell, type TurnInState } from './campaignTurnInsFixtures';
import { MarketFrame, TurnInDetail, TurnInGlyph } from './campaignTurnInsParts';

/**
 * Campaign turn-ins on Market › Hauling. A turn-in item stays listed as an
 * ordinary haul, with its profit still the market's. A small dim glyph after
 * its Sell at Jita price opens `TurnInDetail`. There is no extra line, no
 * re-ranking and no filter.
 *
 * New components in this mockup: the glyph trigger, `TurnInDetail`,
 * `PermissionCellMark` (inside the popover).
 */

interface HaulRow {
  name: string;
  buy: number;
  sell: number;
  quantity: number;
  turnIn?: boolean;
}

const ROWS: readonly HaulRow[] = [
  { name: 'Republic Fleet EMP L', buy: 1_480, sell: 2_290, quantity: 40_000 },
  { name: FAILOVER.name, buy: 49_800, sell: 57_990, quantity: 400, turnIn: true },
  { name: 'Caldari Navy Scourge Heavy Missile', buy: 1_105, sell: 1_620, quantity: 25_000 },
  { name: 'Imperial Navy Multifrequency M', buy: 2_210, sell: 3_050, quantity: 9_000 },
];

interface Options {
  state: TurnInState;
  open?: boolean;
  today?: boolean;
}

function columns({ state, open = false, today = false }: Options): DataTableColumn<HaulRow>[] {
  return [
    {
      id: 'item',
      header: 'Item',
      primary: true,
      render: (row) => <span className={entityLinkClassName('font-medium')}>{row.name}</span>,
    },
    {
      id: 'buy',
      header: 'Buy at Amarr',
      stackAffix: { before: 'Buy ' },
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      render: (row) => formatIsk(row.buy, 0),
    },
    {
      id: 'sell',
      header: 'Sell at Jita',
      stackAffix: { before: 'Sell ' },
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      render: (row) => (
        <span className="inline-flex items-center">
          {formatIsk(row.sell, 0)}
          {row.turnIn && !today && (
            <TurnInDetail
              item={FAILOVER}
              character="Kestrel Vane"
              state={state}
              extra={`Bring ${row.quantity}: ~24.0M turned in at ${FAILOVER.system}`}
              defaultOpen={open}
              trigger={<TurnInGlyph label={`Turn-in reward for ${row.name}`} />}
            />
          )}
        </span>
      ),
    },
    {
      id: 'qty',
      header: 'Bring',
      stackAffix: { before: 'Bring ' },
      align: 'right',
      className: 'tabular-nums',
      render: (row) => row.quantity.toLocaleString('en-US'),
    },
    {
      id: 'profit',
      header: 'Profit',
      cardCorner: true,
      align: 'right',
      className: 'whitespace-nowrap tabular-nums text-isk-pos',
      render: (row) => <IskAmount value={(row.sell * 0.92 - row.buy) * row.quantity} />,
    },
  ];
}

function HaulingMockup(opts: Options) {
  return (
    <MarketFrame tab="hauling">
      <p className="text-sm">
        <span className="font-semibold">Amarr → Jita</span>
        <span className="text-text-dim"> · Ammunition &amp; Charges, Commodities · Mastodon</span>
      </p>
      <Panel title="Worth hauling" padded={false}>
        <div className="min-w-0 overflow-x-auto pb-48">
          <DataTable
            columns={columns(opts)}
            rows={ROWS}
            rowKey={(row) => row.name}
            label="Worth hauling"
            stackLayout="dense"
          />
        </div>
      </Panel>
    </MarketFrame>
  );
}

const meta = {
  title: 'mockups/CampaignTurnIns/Hauling',
  tags: ['!manifest'],
  parameters: { layout: 'fullscreen', shell: turnInShell('/market/hauling') },
  render: () => <HaulingMockup state="participating" />,
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Today: the turn-in item listed as any other haul. */
export const Today: Story = { render: () => <HaulingMockup state="participating" today /> };

/** @summary The glyph after Sell at Jita pressed: TurnInDetail, signed up. */
export const DetailOpen: Story = { render: () => <HaulingMockup state="participating" open /> };

/** @summary The same in the phone shell's dense cards. */
export const DetailOpenPhone: Story = {
  globals: PHONE,
  render: () => <HaulingMockup state="notSignedUp" open />,
};
