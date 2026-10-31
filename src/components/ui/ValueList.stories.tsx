import type { Meta, StoryObj } from '@storybook/react-vite';
import { IskAmount } from './IskAmount';
import { ValueList, ValueRow } from './ValueList';

const meta = {
  title: 'ui/ValueList',
  component: ValueList,
  tags: ['autodocs'],
  args: { children: null },
} satisfies Meta<typeof ValueList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Hairlines between roomy rows: a panel's main list. */
export const Divided: Story = {
  render: (args) => (
    <div className="w-80">
      <ValueList {...args}>
        <ValueRow label="Sell orders" value={<IskAmount value={2_412_000_000} decimals={0} />} />
        <ValueRow label="Buy order escrow" value={<IskAmount value={861_000_000} decimals={0} />} />
        <ValueRow
          label="Contracts outstanding"
          value={<IskAmount value={410_000_000} decimals={0} />}
        />
      </ValueList>
    </div>
  ),
};

/** @summary Tight rows with a dim aside and a status tone, for a sub-list. */
export const PlainWithNotes: Story = {
  args: { variant: 'plain' },
  render: (args) => (
    <div className="w-80">
      <ValueList {...args}>
        <ValueRow
          label="Fine"
          note="3 orders"
          value={<IskAmount value={1_000_000} decimals={0} />}
        />
        <ValueRow
          label="Needs you"
          note="1 order"
          tone="warning"
          value={<IskAmount value={400_000} decimals={0} />}
        />
      </ValueList>
    </div>
  ),
};
