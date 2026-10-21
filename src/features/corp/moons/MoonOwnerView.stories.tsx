import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '@/components/ui';
import { HandledByCard } from './HandledByCard';
import { MoonOwnerView } from './MoonOwnerView';
import { OwnerStaleBanner } from './OwnerStaleBanner';
import { OwnerStatusStrip } from './OwnerStatusStrip';
import { RefineryNamesBanner } from './RefineryNamesBanner';
import { fixtureView, nameOf } from './ownerViewFixtures';

const noop = async () => undefined;
/** The fixtures' names plus the moon owner corporation (98) and a player payee (77). */
const names = (id: number) =>
  id === 98 ? 'Ashfall Mining Collective' : id === 77 ? 'Kestrel Vane' : nameOf(id);

/** @summary The moon owner's page (Page B): statement first, who mined, payments and rate. */
const meta = {
  title: 'corp/MoonOwnerView',
  component: MoonOwnerView,
  parameters: { layout: 'padded' },
  args: {
    view: fixtureView(),
    names,
    nameOf: (id: number) => (id === 98 ? names(id) : id === 30000142 ? 'Jita' : undefined),
    canEdit: true,
    onSetRefineryLabel: noop,
    onRequestRate: noop,
    characterId: 1,
    onSetPayee: noop,
  },
} satisfies Meta<typeof MoonOwnerView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Page B with the rate override line ("Rate set to 8% by ... You asked for 6%."). */
export const Normal: Story = {};

/** @summary Refineries through the label chain: a label either side set, the structure name the grant read, then the system, then the moon owner's own name plus the id. Officers edit a label behind the faint pencil. */
export const RefineryLabels: Story = {
  args: {
    view: {
      ...fixtureView(),
      refineries: [
        { structureId: 10, label: 'Efa - Ashfall Tatara', solarSystemId: null },
        { structureId: 11, label: null, solarSystemId: 30000142 },
        { structureId: 12, label: null, solarSystemId: null },
        {
          structureId: 13,
          label: null,
          solarSystemId: 30000142,
          structureName: 'Jita - Moon Drill',
        },
      ],
      days: fixtureView().days.map((d) => ({
        ...d,
        lines: [
          ...d.lines,
          { characterId: 2, structureId: 12, volume: 40_000, valueIsk: 4_000_000 },
          { characterId: 3, structureId: 13, volume: 25_000, valueIsk: 2_500_000 },
        ],
      })),
    },
  },
};

/** @summary The moon owner named a player as its payee: "Who gets paid" names them, with Change…. */
export const PayeeSet: Story = {
  args: { view: fixtureView({ payee: { kind: 'character', id: 77 } }) },
};

/** @summary The accounting corporation changed the payee (#4653): the strip with Dismiss, and "Set by … on …" on the line. */
export const PayeeChangedByAccounting: Story = {
  args: {
    view: fixtureView({
      payee: { kind: 'character', id: 77 },
      payeeSetBy: { side: 'accounting', at: Date.UTC(2026, 9, 21, 15) },
    }),
  },
};

/** @summary This side set the payee: "Set by you on …", no strip. */
export const PayeeSetByYou: Story = {
  args: {
    view: fixtureView({
      payee: { kind: 'character', id: 77 },
      payeeSetBy: { side: 'moon-owner', at: Date.UTC(2026, 9, 21, 15) },
    }),
  },
};

/** @summary A grant from before refinery names were read (#4654): the optional Grant again prompt above the page. */
export const RefineryNamesNotGranted: Story = {
  args: {
    view: fixtureView({ refineryNamesGranted: false }),
    banner: <RefineryNamesBanner onGrant={() => {}} />,
  },
};

/** @summary The ledger cannot be read: stale banner with Reconnect above the page. */
export const Stale: Story = {
  args: {
    view: fixtureView({ staleSince: Date.UTC(2026, 9, 11) }),
    banner: <OwnerStaleBanner since={Date.UTC(2026, 9, 11)} onReconnect={() => {}} />,
  },
};

/** @summary Compensated another way: the note, mined volume and value, nothing owed in ISK. */
export const SettledOtherwise: Story = {
  args: {
    view: fixtureView({
      mode: 'settled-otherwise',
      note: 'Fuel for their refineries and free rock access for our alliance',
      balanceKind: 'none',
    }),
  },
};

/** @summary After leaving with a balance still owed: card, history, payouts. */
export const AfterLeavingOwed: Story = {
  args: {
    view: fixtureView({ status: 'left', leftAt: Date.UTC(2026, 9, 12) }),
    card: (
      <HandledByCard
        summary={fixtureView({ status: 'left', leftAt: Date.UTC(2026, 9, 12) }).summary}
        name="Brass Meridian Logistics"
        canDismiss
        onDismiss={noop}
      />
    ),
  },
};

/** @summary After leaving and settled: the card folds to one line with Dismiss. */
export const AfterLeavingSettled: Story = {
  args: {
    view: fixtureView({ status: 'left', balanceKind: 'even', balanceIsk: 0 }),
    card: (
      <HandledByCard
        summary={fixtureView({ status: 'left', balanceKind: 'even', balanceIsk: 0 }).summary}
        name="Brass Meridian Logistics"
        canDismiss
        onDismiss={noop}
      />
    ),
  },
};

/** @summary No rate set: nothing is owed and the page says so. */
export const NoRate: Story = {
  args: {
    view: fixtureView({
      effectiveRatePct: null,
      agreedRatePct: null,
      requestedRatePct: null,
      balanceKind: 'none',
      balanceIsk: 0,
      lastPayout: null,
    }),
  },
};

/** @summary The accounting corporation started a removal: the strip, with End it now for the moon owner's officers. */
export const RemovalPending: Story = {
  args: {
    view: fixtureView({ status: 'pending-removal' }),
    banner: (
      <OwnerStatusStrip
        title="Removal pending, takes effect 18 Oct 2026 14:22 EVE time"
        body="Brass Meridian Logistics started this on 17 Oct 2026. If you did not expect it, end it now and get in touch with them."
        actions={
          <Button size="sm" variant="ghost">
            End it now
          </Button>
        }
      />
    ),
  },
};
