import type { Meta, StoryObj } from '@storybook/react-vite';
import { Well } from './Well';

/**
 * @summary An inset `panel-2` box with a hairline, for a note or readout inside a Panel or dialog.
 */
const meta = {
  title: 'ui/Well',
  component: Well,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Well>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Default 8px padding: a one-line readout. */
export const Small: Story = {
  args: { as: 'p', className: 'text-xs tabular-nums', children: 'Owed 12,400,000 ISK' },
};

/** @summary `md`: 10px, for a short stack of facts. */
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

/** @summary `lg`: 12px, for a notice with room to breathe. */
export const Large: Story = {
  args: { size: 'lg', className: 'text-sm', children: 'Mail limit reached for today.' },
};
