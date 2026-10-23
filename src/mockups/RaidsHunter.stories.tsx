import type { Meta, StoryObj } from '@storybook/react-vite';
import { NewComponent } from './NewComponent';
import { emptyView, hunterView, routeView, todayView } from './raidsHunterFixtures';
import { Card, MenuReplica, RadioRow, WhereSegmented } from './raidsHunterParts';

/**
 * Issue #4781: the raider ("where do I go hunt") half of the raids widget, now
 * that `sovRaids` (#4798) covers the member/defender half. Three options, each
 * drawn with the real Overview widget shell on sample data.
 *
 * New components in this mockup: `Radius setting` (a jumps radius is not the
 * Range days setting), `Where setting` (scope choice in the widget menu).
 * Everything else is the real Widget shell, SegmentedControl and Eyebrow.
 */
const meta = {
  title: 'mockups/RaidsHunter',
  tags: ['!manifest'],
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const phone = { viewport: { value: 'mobile1', isRotated: false } } as const;

const Row = ({ children }: { children: React.ReactNode }) => (
  <div className="flex flex-wrap items-start gap-4">{children}</div>
);

function OptionA() {
  return (
    <div className="grid gap-4">
      <h2 className="text-lg font-semibold">
        A: a second widget, "Skyhooks near me" (the ticket's `raids`)
      </h2>
      <Row>
        <Card
          kind="sovRaids"
          view="number"
          size="S"
          title="Skyhooks near me"
          data={hunterView({ withHeld: true, yours: true })}
          width="20rem"
        />
        <Card
          kind="sovRaids"
          view="table"
          size="M"
          title="Skyhooks near me"
          data={hunterView({ withHeld: true, yours: true, footer: '1 more beyond 8 jumps' })}
          width="36rem"
        />
        <NewComponent name="Radius setting">
          <MenuReplica>
            <b>Radius</b>
            {[5, 8, 10, 15].map((n) => (
              <RadioRow key={n} label={`${n} jumps`} on={n === 8} />
            ))}
          </MenuReplica>
        </NewComponent>
      </Row>
      <h3 className="text-sm font-semibold text-text-dim">
        Beside today's Skyhook raids (own alliance)
      </h3>
      <Row>
        <Card kind="sovRaids" view="number" size="S" data={todayView()} width="20rem" />
        <Card kind="sovRaids" view="table" size="M" data={todayView()} width="36rem" />
      </Row>
    </div>
  );
}

function OptionB() {
  return (
    <div className="grid gap-4">
      <h2 className="text-lg font-semibold">
        B: Skyhook raids gets a Where setting (My alliance / Near me)
      </h2>
      <Row>
        <Card
          kind="sovRaids"
          view="table"
          size="M"
          data={hunterView({ withHeld: true, yours: true, footer: '1 more beyond 8 jumps' })}
          width="36rem"
        />
        <NewComponent name="Where setting">
          <MenuReplica>
            <WhereSegmented value="near" />
            <div className="mt-2 grid gap-0.5">
              <b className="px-2">Radius (Near me)</b>
              {[5, 8, 10, 15].map((n) => (
                <RadioRow key={n} label={`${n} jumps`} on={n === 8} />
              ))}
            </div>
          </MenuReplica>
        </NewComponent>
        <Card
          kind="sovRaids"
          view="number"
          size="S"
          data={hunterView({ withHeld: true, yours: true })}
          width="20rem"
        />
      </Row>
      <h3 className="text-sm font-semibold text-text-dim">
        Same widget, My alliance (today, unchanged)
      </h3>
      <Row>
        <Card kind="sovRaids" view="table" size="M" data={todayView()} width="36rem" />
      </Row>
    </div>
  );
}

function OptionC() {
  return (
    <div className="grid gap-4">
      <h2 className="text-lg font-semibold">
        C: no hunter widget; the condition rides Route Safety (+ the alert)
      </h2>
      <Row>
        <Card kind="routeSafety" view="table" size="M" data={routeView()} width="36rem" />
        <Card kind="sovRaids" view="table" size="M" data={todayView()} width="36rem" />
      </Row>
    </div>
  );
}

function States() {
  return (
    <div className="grid gap-4">
      <h2 className="text-lg font-semibold">States of the hunter list (A or B, Near me)</h2>
      <Row>
        <Card
          kind="sovRaids"
          view="table"
          size="M"
          title="Skyhooks near me"
          data={emptyView(
            'No raidable skyhooks within 8 jumps',
            'The list reaches a few hours ahead. Widen the radius or check back.'
          )}
          width="22rem"
        />
        <Card
          kind="sovRaids"
          view="table"
          size="M"
          title="Skyhooks near me"
          data={emptyView(
            'Your location is unknown',
            'Jumps need your current system. Grant location access, or pick a bigger radius once it reads.'
          )}
          width="22rem"
        />
        <Card
          kind="sovRaids"
          view="table"
          size="M"
          title="Skyhooks near me"
          data={emptyView(
            'No raidable skyhooks within 8 jumps',
            'Read 3h ago. Nothing reloads on its own; refresh to check again.'
          )}
          width="22rem"
        />
      </Row>
    </div>
  );
}

const wrap = (c: React.ReactNode) => (
  <div className="mx-auto grid max-w-[1400px] gap-4 p-4">{c}</div>
);

/** @summary A: standalone "Skyhooks near me" widget (Number + Table) with a jumps Radius setting, beside today's own-alliance widget. New components: Radius setting. */
export const OptionAWide: Story = { render: () => wrap(<OptionA />) };
/** @summary A on a phone: widgets stack full width. */
export const OptionAPhone: Story = { globals: phone, render: () => wrap(<OptionA />) };
/** @summary B: the Skyhook raids widget gains a Where setting (My alliance / Near me) and a radius. New components: Where setting. */
export const OptionBWide: Story = { render: () => wrap(<OptionB />) };
/** @summary B on a phone. */
export const OptionBPhone: Story = { globals: phone, render: () => wrap(<OptionB />) };
/** @summary C: no widget; Route Safety carries the raidable-skyhook condition, beside today's widget. */
export const OptionCWide: Story = { render: () => wrap(<OptionC />) };
/** @summary C on a phone. */
export const OptionCPhone: Story = { globals: phone, render: () => wrap(<OptionC />) };
/** @summary Empty, location-unknown and stale-empty states for the hunter list. */
export const StatesWide: Story = { render: () => wrap(<States />) };
/** @summary The states on a phone. */
export const StatesPhone: Story = { globals: phone, render: () => wrap(<States />) };
