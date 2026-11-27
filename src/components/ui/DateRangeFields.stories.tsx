import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { DateRangeFields } from './DateRangeFields';

/**
 * @summary From and To date fields for a filter row. A box sized like a field marks a control (§6c); cleared fields report `null`.
 */
const meta = {
  title: 'ui/DateRangeFields',
  component: DateRangeFields,
  tags: ['autodocs'],
  args: {
    from: null,
    to: null,
    fromLabel: 'From',
    toLabel: 'To',
    onFromChange: () => {},
    onToChange: () => {},
  },
  render: function Render(args) {
    const [from, setFrom] = useState(args.from);
    const [to, setTo] = useState(args.to);
    return (
      <div className="flex flex-wrap items-center gap-3">
        <DateRangeFields {...args} from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
      </div>
    );
  },
} satisfies Meta<typeof DateRangeFields>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Both ends open. */
export const Empty: Story = {};

/** @summary A chosen range. */
export const Filled: Story = { args: { from: '2026-09-01', to: '2026-09-30' } };
