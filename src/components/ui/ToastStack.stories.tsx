import type { Meta, StoryObj } from '@storybook/react-vite';
import { ToastStack } from './ToastStack';

const noop = () => {};

/**
 * Several Undo toasts at once, newest at the bottom. Feedback cue (§6c Undo)
 * for an action that can repeat before the first Undo expires.
 *
 * @summary Stack of Undo toasts, each with its own Undo and clock.
 */
const meta = {
  title: 'ui/ToastStack',
  component: ToastStack,
  tags: ['autodocs'],
  args: { undoLabel: 'Undo', onUndo: noop, onClose: noop, items: [] },
} satisfies Meta<typeof ToastStack>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Feedback cue (§6c Undo): one deferred delete, like a single Undo toast. */
export const One: Story = {
  args: { items: [{ id: 'a', message: 'Deleted "Rifter run"' }] },
};

/** @summary Feedback cue (§6c Undo): three deletes in a row, the cap; the next pushes the oldest out. */
export const Three: Story = {
  args: {
    items: [
      { id: 'a', message: 'Deleted "Rifter run"' },
      { id: 'b', message: 'Deleted "Tengu hulls"' },
      { id: 'c', message: 'Deleted "Capital components"' },
    ],
  },
};
