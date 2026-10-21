import type { Meta, StoryObj } from '@storybook/react-vite';
import { HandledByCard } from './HandledByCard';
import { MoonOwnerView } from './MoonOwnerView';
import { OwnerStaleBanner } from './OwnerStaleBanner';
import { OwnerStatusStrip } from './OwnerStatusStrip';
import { fixtureView, nameOf } from './ownerViewFixtures';

const noop = async () => undefined;

/** @summary The moon owner's page (Page B): statement first, who mined, payments and rate. */
const meta = {
  title: 'corp/MoonOwnerView',
  component: MoonOwnerView,
  parameters: { layout: 'padded' },
  args: { view: fixtureView(), names: nameOf, canEdit: true, onRequestRate: noop },
} satisfies Meta<typeof MoonOwnerView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Page B with the rate override line ("Rate set to 8% by ... You asked for 6%."). */
export const Normal: Story = {};

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
        actions={<button type="button">End it now</button>}
      />
    ),
  },
};
