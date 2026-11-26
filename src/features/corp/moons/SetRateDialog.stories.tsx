import type { Meta, StoryObj } from '@storybook/react-vite';
import { SetRateDialog } from './MoonOwnerDialogs';

const meta = {
  title: 'corp/SetRateDialog',
  component: SetRateDialog,
  parameters: { layout: 'fullscreen' },
  args: {
    initial: null,
    today: '2026-11-17',
    earliest: '2026-10-18',
    onClose: () => {},
    onSave: async () => {},
  },
} satisfies Meta<typeof SetRateDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NotSetYet: Story = {};

export const ChangeRate: Story = { args: { initial: 8 } };
