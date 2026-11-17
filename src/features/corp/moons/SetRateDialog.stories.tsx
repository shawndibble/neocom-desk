import type { Meta, StoryObj } from '@storybook/react-vite';
import { SetRateDialog } from './MoonOwnerDialogs';

/** @summary "Set their rate" with the as-of day: today by default, up to 30 days back. */
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

/** @summary No rate yet: the day defaults to today. */
export const NotSetYet: Story = {};

/** @summary A rate is in force: the field holds it, the day is today. */
export const ChangeRate: Story = { args: { initial: 8 } };
