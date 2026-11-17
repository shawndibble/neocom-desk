import type { Meta, StoryObj } from '@storybook/react-vite';
import { RemoveMoonOwnerDialog, SetRateDialog } from './MoonOwnerDialogs';

/** @summary "Remove from this book": who is mailed, what is kept, and the 24-hour wait. */
const meta = {
  title: 'corp/RemoveMoonOwnerDialog',
  component: RemoveMoonOwnerDialog,
  parameters: { layout: 'fullscreen' },
  args: {
    ownerName: 'Ostrava Salvage',
    accountingName: 'Brass Meridian Logistics',
    hasPayee: true,
    onClose: () => {},
    onStart: async () => {},
  },
} satisfies Meta<typeof RemoveMoonOwnerDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary A payee is on record, so the list says they are mailed. */
export const WithPayee: Story = {};

/** @summary No payee on record. */
export const NoPayee: Story = { args: { hasPayee: false } };

/** @summary "Set their rate" with the as-of day: today by default, up to 30 days back. */
export const SetRate: StoryObj<typeof SetRateDialog> = {
  render: () => (
    <SetRateDialog
      initial={null}
      today="2026-11-17"
      earliest="2026-10-18"
      onClose={() => {}}
      onSave={async () => {}}
    />
  ),
};
