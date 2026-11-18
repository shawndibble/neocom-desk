import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './Button';
import { DialogFooter } from './DialogFooter';

/**
 * @summary The action row at a dialog's foot: Cancel then the primary or danger action, right-aligned.
 */
const meta = {
  title: 'ui/DialogFooter',
  component: DialogFooter,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof DialogFooter>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Desktop: Cancel (ghost) then the primary action, right-aligned. */
export const Default: Story = {
  args: {
    children: (
      <>
        <Button variant="ghost">Cancel</Button>
        <Button variant="primary">Save</Button>
      </>
    ),
  },
};

/** @summary A destructive confirm: the action is `danger`. */
export const Danger: Story = {
  args: {
    children: (
      <>
        <Button variant="ghost">Cancel</Button>
        <Button variant="danger">Remove</Button>
      </>
    ),
  },
};

/** @summary `stacked`, for a phone: full-width buttons, primary on top. */
export const Stacked: Story = {
  args: {
    stacked: true,
    children: (
      <>
        <Button variant="ghost">Cancel</Button>
        <Button variant="primary">Save</Button>
      </>
    ),
  },
};
