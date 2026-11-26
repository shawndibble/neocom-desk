import type { Meta, StoryObj } from '@storybook/react-vite';
import { AlertsSignInConfirm } from './AlertsSignInConfirm';

const meta = {
  title: 'notifications/AlertsSignInConfirm',
  component: AlertsSignInConfirm,
  parameters: { layout: 'fullscreen' },
  args: {
    names: new Map([
      [1, 'Alpha Pilot'],
      [2, 'Beta Hauler With A Long Name'],
      [3, 'Gamma'],
    ]),
    busy: false,
    onCancel: () => {},
    onContinue: () => {},
  },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-lg p-3">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AlertsSignInConfirm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllPermissions: Story = {
  args: {
    needs: [
      {
        characterId: 1,
        held: [],
        wanted: ['notifications', 'location', 'mail'],
        missing: ['notifications', 'location', 'mail'],
        needsWalk: true,
      },
      {
        characterId: 2,
        held: ['notifications'],
        wanted: ['notifications', 'location', 'mail'],
        missing: ['location', 'mail'],
        needsWalk: true,
      },
      {
        characterId: 3,
        held: [],
        wanted: ['notifications', 'location'],
        missing: ['notifications', 'location'],
        needsWalk: true,
      },
    ],
  },
};

export const NotificationsOnly: Story = {
  args: {
    needs: [
      {
        characterId: 3,
        held: [],
        wanted: ['notifications'],
        missing: ['notifications'],
        needsWalk: true,
      },
    ],
  },
};
