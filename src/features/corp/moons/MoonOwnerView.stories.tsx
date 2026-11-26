import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '@/components/ui';
import { HandledByCard } from './HandledByCard';
import { MoonOwnerView } from './MoonOwnerView';
import { OwnerStaleBanner } from './OwnerStaleBanner';
import { OwnerStatusStrip } from './OwnerStatusStrip';
import { GrantAgainBanner } from './GrantAgainBanner';
import { fixtureView, nameOf } from './ownerViewFixtures';

const noop = async () => undefined;
const names = (id: number) =>
  id === 98 ? 'Ashfall Mining Collective' : id === 77 ? 'Kestrel Vane' : nameOf(id);

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

export const Normal: Story = {};

const twoMonths = fixtureView();
twoMonths.days = [
  ...twoMonths.days,
  {
    date: '2026-09-28',
    lines: [{ characterId: 2, structureId: 11, typeId: 45492, volume: 64_000, quantity: 64_000 }],
  },
];

export const TwoMonths: Story = { args: { view: twoMonths } };

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
          { characterId: 2, structureId: 12, typeId: 45490, volume: 40_000, quantity: 40_000 },
          { characterId: 3, structureId: 13, typeId: 45492, volume: 25_000, quantity: 25_000 },
        ],
      })),
    },
  },
};

export const PayeeSet: Story = {
  args: { view: fixtureView({ payee: { kind: 'character', id: 77 } }) },
};

export const PayeeChangedByAccounting: Story = {
  args: {
    view: fixtureView({
      payee: { kind: 'character', id: 77 },
      payeeSetBy: { side: 'accounting', at: Date.UTC(2026, 9, 21, 15) },
    }),
  },
};

export const PayeeSetByYou: Story = {
  args: {
    view: fixtureView({
      payee: { kind: 'character', id: 77 },
      payeeSetBy: { side: 'moon-owner', at: Date.UTC(2026, 9, 21, 15) },
    }),
  },
};

export const RefineryNamesNotGranted: Story = {
  args: {
    view: fixtureView({ refineryNamesGranted: false }),
    banner: <GrantAgainBanner lacks="names" onGrant={() => {}} />,
  },
};

export const Stale: Story = {
  args: {
    view: fixtureView({ staleSince: Date.UTC(2026, 9, 11) }),
    banner: <OwnerStaleBanner since={Date.UTC(2026, 9, 11)} daysLeft={21} onReconnect={() => {}} />,
  },
};

export const SettledOtherwise: Story = {
  args: {
    view: fixtureView({
      mode: 'settled-otherwise',
      note: 'Fuel for their refineries and free rock access for our alliance',
      balanceKind: 'none',
    }),
  },
};

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
