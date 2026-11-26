import type { Meta, StoryObj } from '@storybook/react-vite';
import { LeaveMoonOwnerDialog } from './LeaveMoonOwnerDialog';

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

export const Owed: Story = {};

export const NothingOwed: Story = { args: { owed: 0 } };

export const Unknown: Story = { args: { owed: null } };

export const EndRemovalNow: Story = { args: { removing: true } };
