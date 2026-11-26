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

export const Basic: Story = {};

export const WithTooltip: Story = {
  args: { label: 'EIV', value: '4.1M', tooltip: 'Estimated item value, the base of job fees.' },
};

export const Emphasis: Story = { args: { emphasis: true } };

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

export const Strip: Story = {
  render: () => (
    <StatChips>
      <StatChip label="Balance" value="1.2B ISK" />
      <StatChip label="SP" value="84.2M" />
      <StatChip label="Jobs" value="12" />
    </StatChips>
  ),
};

export const Linked: Story = {
  render: () => (
    <StatChips>
      <StatChip label="Owed" value="12.4M" emphasis to="/miners?balance=owing" />
      <StatChip
        label="Overdue"
        value="9.3M · 3 Miners"
        tone="danger"
        to="/miners?balance=overdue"
      />
      <StatChip label="Next Statement" value="2.1M" />
    </StatChips>
  ),
};
