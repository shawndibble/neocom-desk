import type { Meta, StoryObj } from '@storybook/react-vite';
import { ConfirmDialog } from './ConfirmDialog';

const meta = {
  title: 'ui/ConfirmDialog',
  component: ConfirmDialog,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  args: {
    open: true,
    title: 'Clear cached data?',
    body: 'Everything fetched from ESI is cleared and fetched again as pages need it.',
    actionLabel: 'Clear cache',
    cancelLabel: 'Cancel',
    failedLabel: 'Could not clear the cache.',
    onConfirm: () => Promise.resolve(),
    onClose: () => {},
  },
} satisfies Meta<typeof ConfirmDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Danger: Story = {};

export const WithField: Story = {
  args: { children: <input type="date" aria-label="Left on" defaultValue="2026-11-10" /> },
};

export const Plain: Story = { args: { danger: false, actionLabel: 'Continue' } };
