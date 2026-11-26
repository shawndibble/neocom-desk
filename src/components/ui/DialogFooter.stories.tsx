import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './Button';
import { DialogFooter } from './DialogFooter';

const meta = {
  title: 'ui/DialogFooter',
  component: DialogFooter,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof DialogFooter>;

export default meta;
type Story = StoryObj<typeof meta>;

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
