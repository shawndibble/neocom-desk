import type { Meta, StoryObj } from '@storybook/react-vite';
import { ToastStack } from './ToastStack';

const noop = () => {};

const meta = {
  title: 'ui/ToastStack',
  component: ToastStack,
  tags: ['autodocs'],
  args: { undoLabel: 'Undo', onUndo: noop, onClose: noop, items: [] },
} satisfies Meta<typeof ToastStack>;

export default meta;
type Story = StoryObj<typeof meta>;

export const One: Story = {
  args: { items: [{ id: 'a', message: 'Deleted "Rifter run"' }] },
};

export const Three: Story = {
  args: {
    items: [
      { id: 'a', message: 'Deleted "Rifter run"' },
      { id: 'b', message: 'Deleted "Tengu hulls"' },
      { id: 'c', message: 'Deleted "Capital components"' },
    ],
  },
};
