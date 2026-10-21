import type { Meta, StoryObj } from '@storybook/react-vite';
import { RemoveMoonOwnerDialog } from './MoonOwnerDialogs';

/** @summary "Remove from this book…": who is mailed, what is kept, and the 24-hour wait. */
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
