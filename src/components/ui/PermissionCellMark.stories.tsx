import type { Meta, StoryObj } from '@storybook/react-vite';
import { Link } from 'react-router-dom';
import { inlineLinkClassName } from './controlStyles';
import { PermissionCellMark } from './PermissionCellMark';
import { Tooltip } from './Tooltip';

/** @summary Amber mark that opens a per-Character grant popover with Don't ask again. */
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

/** @summary Missing: the mark after the control, nothing else in the layout. */
export const Missing: Story = {};

/** @summary Open: who and what, one why line, Grant in EVE, Don't ask again and the Settings link. */
export const Open: Story = { args: { defaultOpen: true } };

/** @summary Granted: no mark at all. */
export const Granted: Story = { args: { status: 'granted' } };

/** @summary Dismissed: no mark; the caller's own tooltip carries the fallback words. */
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

/** @summary Several Permissions missing at once: named together, granted in one login. */
export const SeveralPermissions: Story = {
  args: { permissions: ['Autopilot waypoints', 'Character details'], defaultOpen: true },
};

/** @summary 390px: still a popover (three lines, anchored to its cell), capped to the screen. */
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
