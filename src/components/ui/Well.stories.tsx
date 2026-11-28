import type { Meta, StoryObj } from '@storybook/react-vite';
import { Well } from './Well';

/** @summary An inset box with a hairline, for a note, callout or readout inside a Panel or dialog. */
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

/** @summary `flat`: 12px sides, 8px top and bottom, for a one-line note across a panel. */
export const Flat: Story = {
  args: {
    size: 'flat',
    as: 'p',
    className: 'text-xs text-text-dim',
    children: 'Saved on this device only.',
  },
};

/** @summary `tone="warning"`: a callout that needs the pilot's eye. */
export const Warning: Story = {
  args: { tone: 'warning', className: 'text-xs', children: 'Two entries claim the same ore.' },
};

/** @summary `tone="danger"`: a callout about a problem or a loss. */
export const Danger: Story = {
  args: { tone: 'danger', size: 'lg', className: 'text-xs', children: 'Not enough powergrid.' },
};

/** @summary `tone="accent"`: a callout about the pilot's own choice or the plan's answer. */
export const Accent: Story = {
  args: {
    tone: 'accent',
    size: 'lg',
    className: 'text-sm',
    children: 'Deliver to Jita IV - Moon 4.',
  },
};
