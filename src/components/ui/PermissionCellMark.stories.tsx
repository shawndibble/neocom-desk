import type { Meta, StoryObj } from '@storybook/react-vite';
import { Link } from 'react-router-dom';
import { inlineLinkClassName } from './controlStyles';
import { PermissionCellMark } from './PermissionCellMark';
import { Tooltip } from './Tooltip';

const meta = {
  title: 'ui/PermissionCellMark',
  component: PermissionCellMark,
  tags: ['autodocs'],
  args: {
    status: 'missing',
    character: 'Kestrel Vane',
    permissions: ['Autopilot waypoints'],
    why: 'Set destination sends the route to your EVE client.',
    onGrant: () => {},
    onDismiss: () => {},
    settingsLink: (
      <Link to="/settings/permissions?grant=autopilot" className={inlineLinkClassName}>
        Grant missing Permissions
      </Link>
    ),
  },
  render: (args) => (
    <p className="flex items-center gap-1 text-sm text-text">
      <span>Jita IV - Moon 4</span>
      <button type="button" aria-disabled="true" className="text-text-dim opacity-40">
        Set destination
      </button>
      <PermissionCellMark {...args} />
    </p>
  ),
} satisfies Meta<typeof PermissionCellMark>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Missing: Story = {};

export const Open: Story = { args: { defaultOpen: true } };

export const Granted: Story = { args: { status: 'granted' } };

export const Dismissed: Story = {
  args: { status: 'dismissed' },
  render: (args) => (
    <p className="flex items-center gap-1 text-sm text-text">
      <Tooltip content="Needs the Autopilot waypoints Permission">
        <button type="button" aria-disabled="true" className="text-text-dim opacity-40">
          Set destination
        </button>
      </Tooltip>
      <PermissionCellMark {...args} />
    </p>
  ),
};

export const SeveralPermissions: Story = {
  args: { permissions: ['Autopilot waypoints', 'Character details'], defaultOpen: true },
};

export const SeveralCharacters: Story = {
  args: {
    title: '3 Characters: grant Military Campaigns',
    grantLabel: 'Grant in EVE for Mira Solenne',
    defaultOpen: true,
  },
};

export const Phone: Story = {
  args: { defaultOpen: true },
  globals: { viewport: { value: 'phone390', isRotated: false } },
};
