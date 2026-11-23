import type { Meta, StoryObj } from '@storybook/react-vite';
import { ConfirmDialog } from './ConfirmDialog';

/**
 * @summary A confirm for one action: body text, a danger or plain action button, and its own
 * failure line. `onConfirm` rejecting keeps the dialog open and shows `failedLabel`. Open here,
 * since a closed dialog renders nothing.
 */
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

/** @summary `danger` (default): the action button is red, for a destructive confirm. */
export const Danger: Story = {};

/** @summary `children`: a field the confirm asks for, below the body. */
export const WithField: Story = {
  args: { children: <input type="date" aria-label="Left on" defaultValue="2026-11-10" /> },
};

/** @summary `danger={false}`: a plain primary action. */
export const Plain: Story = { args: { danger: false, actionLabel: 'Continue' } };
