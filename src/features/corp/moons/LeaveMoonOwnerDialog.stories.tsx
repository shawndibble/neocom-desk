import type { Meta, StoryObj } from '@storybook/react-vite';
import { LeaveMoonOwnerDialog } from './LeaveMoonOwnerDialog';

/** @summary Leave an accounting corporation: shows what is still owed before anything is revoked. */
const meta = {
  title: 'corp/LeaveMoonOwnerDialog',
  component: LeaveMoonOwnerDialog,
  parameters: { layout: 'fullscreen' },
  args: {
    name: 'Brass Meridian Logistics',
    owed: 13_024_480,
    removing: false,
    onClose: () => {},
    onLeave: async () => {},
  },
} satisfies Meta<typeof LeaveMoonOwnerDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary A balance is still owed: it stays owed after leaving. */
export const Owed: Story = {};

/** @summary Nothing is owed right now. */
export const NothingOwed: Story = { args: { owed: 0 } };

/** @summary The page has not loaded, so the balance is unknown. */
export const Unknown: Story = { args: { owed: null } };

/** @summary A removal is pending: the same dialog ends it now. */
export const EndRemovalNow: Story = { args: { removing: true } };
