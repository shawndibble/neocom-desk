import type { Meta, StoryObj } from '@storybook/react-vite';
import { DataTable, Panel, StatChip, StatChips, Tabs } from '@/components/ui';
import { formatIsk } from '@/lib/isk';
import {
  FAILOVER,
  PHONE,
  approxK,
  rewardEach,
  turnInShell,
  type TurnInState,
  type WriteState,
} from './campaignTurnInsFixtures';
import { MarketFrame, TurnInDetail, TurnInFigure } from './campaignTurnInsParts';

/**
 * Campaign turn-ins in the Market Browser's item view. After the spread, one
 * more figure, "Turn in ~60k", which opens `TurnInDetail`. There is no separate
 * note line, and the order book is untouched.
 *
 * New components in this mockup: the Turn in figure (dashed outline),
 * `TurnInDetail`, and `PermissionCellMark` (inside the popover).
 */

interface BookRow {
  price: number;
  quantity: number;
  station: string;
}

const SELLS: readonly BookRow[] = [
  { price: 58_000, quantity: 64, station: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant' },
  { price: 58_490, quantity: 210, station: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant' },
  { price: 59_900, quantity: 35, station: 'Perimeter - Tranquility Trading Tower' },
  { price: 61_000, quantity: 500, station: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant' },
];

interface Options {
  state: TurnInState;
  write?: WriteState;
  open?: boolean;
  today?: boolean;
}

function ItemView({ state, write, open = false, today = false }: Options) {
  return (
    <MarketFrame tab="browser">
      <Panel
        title={FAILOVER.name}
        meta={<span className="text-xs text-text-dim">Commodities</span>}
      >
        <StatChips>
          <StatChip label="Jita sell" value={`${formatIsk(FAILOVER.jitaSell, 0)} ISK`} />
          <StatChip label="Jita buy" value={`${formatIsk(FAILOVER.jitaBuy, 0)} ISK`} />
          <StatChip
            label="Spread"
            value={`${formatIsk(FAILOVER.jitaSell - FAILOVER.jitaBuy, 0)} ISK`}
          />
          {!today && (
            <span className="rounded-xs outline-dashed outline-1 outline-offset-1 outline-warning">
              <StatChip
                label="Turn in"
                tone="accent"
                value={
                  <TurnInDetail
                    item={FAILOVER}
                    character="Kestrel Vane"
                    state={state}
                    write={write}
                    defaultOpen={open}
                    trigger={
                      <TurnInFigure label={`Turn-in reward for ${FAILOVER.name}:`}>
                        {approxK(rewardEach(FAILOVER))}
                      </TurnInFigure>
                    }
                  />
                }
              />
            </span>
          )}
        </StatChips>
        <Tabs
          className="mt-3"
          label="Item view"
          tabsId="mockup-item"
          value="book"
          onChange={() => {}}
          tabs={[
            { id: 'book', label: 'Order Book' },
            { id: 'history', label: 'Price History' },
          ]}
        />
        <DataTable
          columns={[
            {
              id: 'price',
              header: 'Price',
              align: 'right',
              className: 'whitespace-nowrap tabular-nums',
              render: (row) => formatIsk(row.price, 2),
            },
            {
              id: 'qty',
              header: 'Qty',
              align: 'right',
              className: 'tabular-nums',
              render: (row) => row.quantity.toLocaleString('en-US'),
            },
            {
              id: 'station',
              header: 'Station',
              className: 'text-text-dim',
              render: (row) => row.station,
            },
          ]}
          rows={SELLS}
          rowKey={(row) => row.price}
          label="Sell orders"
          responsive="table"
        />
      </Panel>
    </MarketFrame>
  );
}

const meta = {
  title: 'mockups/CampaignTurnIns/MarketItem',
  tags: ['!manifest'],
  parameters: { layout: 'fullscreen', shell: turnInShell('/market/browser') },
  render: () => <ItemView state="participating" />,
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Today: sell, buy and spread. */
export const Today: Story = { render: () => <ItemView state="participating" today /> };

/** @summary "Turn in ~60k" after the spread; the figure opens TurnInDetail. */
export const Proposed: Story = {};

/** @summary The figure pressed: TurnInDetail, signed up. */
export const DetailOpen: Story = { render: () => <ItemView state="participating" open /> };

/** @summary Not signed up: the popover's warning line. */
export const NotSignedUp: Story = { render: () => <ItemView state="notSignedUp" open /> };

/** @summary Military Campaigns missing: the amber mark inside the popover by the Participate line. */
export const PermissionMissing: Story = { render: () => <ItemView state="missing" open /> };

/** @summary Phone: the figure wraps with the chips; the popover fits the width. */
export const DetailOpenPhone: Story = {
  globals: PHONE,
  render: () => <ItemView state="participating" write="missing" open />,
};
