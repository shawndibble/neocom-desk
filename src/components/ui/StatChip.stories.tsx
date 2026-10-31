import type { Meta, StoryObj } from '@storybook/react-vite';
import { StatChip, StatChips } from './StatChip';

const meta = {
  title: 'ui/StatChip',
  component: StatChip,
  tags: ['autodocs'],
  args: { label: 'Balance', value: '1.2B ISK' },
} satisfies Meta<typeof StatChip>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary A label and a value. */
export const Basic: Story = {};

/** @summary An `InfoTooltip` after the label explains jargon. */
export const WithTooltip: Story = {
  args: { label: 'EIV', value: '4.1M', tooltip: 'Estimated item value, the base of job fees.' },
};

/** @summary Larger, semibold value for the one figure that matters most. */
export const Emphasis: Story = { args: { emphasis: true } };

/** @summary `truncate` caps a free-text value at its row and ends it in an ellipsis. */
export const Truncated: Story = {
  args: {
    label: 'Longest stay',
    value: '3y The Extraordinarily Long Named Corporation Of Many Words',
    truncate: true,
  },
  render: (args) => (
    <div className="w-72">
      <StatChips>
        <StatChip {...args} />
      </StatChips>
    </div>
  ),
};

/** @summary A strip of chips with hairlines between; it wraps at narrow widths. */
export const Strip: Story = {
  render: () => (
    <StatChips>
      <StatChip label="Balance" value="1.2B ISK" />
      <StatChip label="SP" value="84.2M" />
      <StatChip label="Jobs" value="12" />
    </StatChips>
  ),
};
