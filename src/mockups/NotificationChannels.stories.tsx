import type { Meta, StoryObj } from '@storybook/react-vite';
import { Panel } from '@/components/ui';
import {
  ALERTS_TOGGLE_OFF,
  Caption,
  DEVICE_PERMISSION_OFF,
  DEVICE_TOGGLE_OFF,
  DeliveryStrip,
  MissingGrantNew,
  MockChips,
  MockRow,
  RowTable,
} from './notificationChannelsParts';

/**
 * Issue #5330: Settings › Notifications. A red, slashed icon on a row that
 * needs a grant the Character lacks; the Device and Alerts columns, and the
 * D and A boxes in an opened event, greyed out (ticks kept) while their
 * channel is off.
 *
 * New components in this mockup: `MissingGrantBadge` (the red, slashed
 * broadcast icon). The greyed boxes are the existing disabled `Checkbox` with
 * a tooltip that says why. Rows are drawn from the real row grid, so layout
 * matches the page.
 */
const meta = {
  title: 'mockups/NotificationChannels',
  tags: ['!manifest'],
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Ticks as the user left them: Device on for everything, Alerts on for some. */
function Rows({
  deviceOff,
  alertsOff,
  mailGrant = false,
}: {
  deviceOff?: string;
  alertsOff?: string;
  mailGrant?: boolean;
}) {
  return (
    <RowTable>
      <MockRow
        label="Skill finished"
        badge="ok"
        device
        alerts
        deviceOff={deviceOff}
        alertsOff={alertsOff}
      />
      <MockRow
        label="Contract about to expire"
        badge="ok"
        device
        alerts={false}
        deviceOff={deviceOff}
        alertsOff={alertsOff}
      />
      <MockRow
        label="New mail"
        badge={mailGrant ? 'ok' : 'missing'}
        device
        alerts
        deviceOff={deviceOff}
        alertsOff={alertsOff}
        missingStep="Needs Alerts when closed with mail. Turn it on in Manage Alerts when closed."
      />
      <MockRow
        label="Incursion nearby"
        badge="missing"
        device={false}
        alerts
        deviceOff={deviceOff}
        alertsOff={alertsOff}
        missingStep="Needs Alerts when closed with location. Turn it on in Manage Alerts when closed."
      />
      <MockRow
        label="Structure under attack"
        badge="missing"
        device
        alerts
        deviceOff={deviceOff}
        alertsOff={alertsOff}
      />
      <MockRow
        label="Sell order filled"
        badge="none"
        device
        alerts
        deviceOff={deviceOff}
        alertsOff={alertsOff}
      />
    </RowTable>
  );
}

/** @summary Today: Device not granted, yet the column is live and the mail, nearby and attack rows carry no icon. */
export const Today: Story = {
  render: () => (
    <Panel title="Notifications, today">
      <DeliveryStrip deviceOn alertsOn permission="default" />
      <RowTable>
        <MockRow label="Skill finished" badge="ok" device alerts />
        <MockRow label="New mail" badge="none" device alerts />
        <MockRow label="Incursion nearby" badge="none" device={false} alerts />
        <MockRow label="Structure under attack" badge="none" device alerts />
      </RowTable>
    </Panel>
  ),
};

/** @summary Proposed: permission never granted. Device column greyed with ticks kept; red slashed icon on rows that need a grant. New component: MissingGrantBadge. */
export const ProposedDeviceNotGranted: Story = {
  render: () => (
    <Panel title="Notifications, proposed">
      <Caption>
        Device permission never granted. Hover or tap a greyed box or the red icon for the reason.
      </Caption>
      <DeliveryStrip deviceOn alertsOn permission="default" />
      <MissingGrantNew>
        <Rows deviceOff={DEVICE_PERMISSION_OFF} />
      </MissingGrantNew>
    </Panel>
  ),
};

/** @summary Proposed: Device toggle turned off with permission granted. Same greyed column, new short reason. */
export const ProposedDeviceToggleOff: Story = {
  render: () => (
    <Panel title="Notifications, proposed">
      <Caption>Device toggle off. Ticks stay; they come back live when it is turned on.</Caption>
      <DeliveryStrip deviceOn={false} alertsOn permission="granted" />
      <MissingGrantNew>
        <Rows deviceOff={DEVICE_TOGGLE_OFF} />
      </MissingGrantNew>
    </Panel>
  ),
};

/** @summary Proposed: Alerts list toggle off. Alerts column greyed, ticks kept. */
export const ProposedAlertsOff: Story = {
  render: () => (
    <Panel title="Notifications, proposed">
      <Caption>Alerts list turned off. The Alerts column is greyed; Device stays live.</Caption>
      <DeliveryStrip deviceOn alertsOn={false} permission="granted" />
      <MissingGrantNew>
        <Rows alertsOff={ALERTS_TOGGLE_OFF} mailGrant />
      </MissingGrantNew>
    </Panel>
  ),
};

/** @summary Proposed: an opened event with Device and Alerts both off. D and A boxes greyed, ticks kept. */
export const ProposedOpenedEvent: Story = {
  render: () => (
    <Panel title="Notifications, proposed">
      <Caption>An opened event while both channels are off.</Caption>
      <div className="rounded-xs border border-line bg-panel">
        <ul>
          <MockRow
            label="Structure under attack"
            badge="missing"
            device
            alerts
            deviceOff={DEVICE_TOGGLE_OFF}
            alertsOff={ALERTS_TOGGLE_OFF}
          />
        </ul>
        <MockChips deviceOff={DEVICE_TOGGLE_OFF} alertsOff={ALERTS_TOGGLE_OFF} />
      </div>
    </Panel>
  ),
};

/** @summary Phone: permission never granted. */
export const ProposedDeviceNotGrantedPhone: Story = {
  ...ProposedDeviceNotGranted,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};

/** @summary Phone: opened event with both channels off. */
export const ProposedOpenedEventPhone: Story = {
  ...ProposedOpenedEvent,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
