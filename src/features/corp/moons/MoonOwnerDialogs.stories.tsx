import type { Meta, StoryObj } from '@storybook/react-vite';
import { RemoveMoonOwnerDialog } from './MoonOwnerDialogs';

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

export const WithPayee: Story = {};

export const NoPayee: Story = { args: { hasPayee: false } };
