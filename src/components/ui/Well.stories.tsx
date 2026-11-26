import type { Meta, StoryObj } from '@storybook/react-vite';
import { Well } from './Well';

const meta = {
  title: 'ui/Well',
  component: Well,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Well>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Small: Story = {
  args: { as: 'p', className: 'text-xs tabular-nums', children: 'Owed 12,400,000 ISK' },
};

export const Medium: Story = {
  args: {
    size: 'md',
    className: 'space-y-1 text-xs',
    children: (
      <>
        <p>Paid 4,000,000 ISK</p>
        <p>Remaining 8,400,000 ISK</p>
      </>
    ),
  },
};

export const Large: Story = {
  args: { size: 'lg', className: 'text-sm', children: 'Mail limit reached for today.' },
};
