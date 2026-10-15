import type { Meta, StoryObj } from '@storybook/react-vite';
import { communityOfferToSearchRow } from '@/engine/contracts/bpcSearch';
import { CommunityOfferCell } from './CommunityOfferCell';

const offer = (runs: number, memberName: string, stale = false) =>
  communityOfferToSearchRow({
    uid: `u-${memberName}`,
    memberName,
    typeId: 638,
    me: 10,
    te: 20,
    runs,
    quantity: 1,
    communities: [{ id: 'c1', name: 'Brass Meridian Industrialists' }],
    stale,
    asOf: 1,
    locationName: 'Jita IV - Moon 4',
    systemName: 'Jita',
  });

const asCommunity = (row: ReturnType<typeof offer>) => {
  if (row.source !== 'community') throw new Error('not a community row');
  return row;
};

const title = <span className="text-accent">Rifter Blueprint</span>;

/**
 * @summary The Item cell of a Community Offer row in BPC Sourcing: a Shared BPO is "ask <name> to
 * copy…" (a button), a copy is "from <name>", a reaction formula keeps the plain text.
 */
const meta = {
  title: 'bpcContracts/CommunityOfferCell',
  component: CommunityOfferCell,
  parameters: { layout: 'padded' },
  render: () => (
    <ul className="flex max-w-md flex-col gap-3 bg-panel p-4">
      <li>
        <CommunityOfferCell
          row={asCommunity(offer(-1, 'Ilvara Nokk'))}
          title={title}
          canAsk
          onAsk={() => undefined}
        />
      </li>
      <li>
        <CommunityOfferCell
          row={asCommunity(offer(10, 'Dax Orrelin'))}
          title={title}
          canAsk={false}
          onAsk={() => undefined}
        />
      </li>
      <li>
        <CommunityOfferCell
          row={asCommunity(offer(-1, 'Sable Quillon'))}
          title={title}
          canAsk={false}
          onAsk={() => undefined}
        />
      </li>
      <li>
        <CommunityOfferCell
          row={asCommunity(offer(-1, 'Thessaly Brandt', true))}
          title={title}
          canAsk
          onAsk={() => undefined}
        />
      </li>
    </ul>
  ),
} satisfies Meta<typeof CommunityOfferCell>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Four rows: ask to copy (button), a copy, a reaction formula (plain), a stale library. */
export const Rows: Story = {
  args: { row: asCommunity(offer(-1, 'x')), title, canAsk: true, onAsk: () => undefined },
};
