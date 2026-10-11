import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { SegmentedControl } from './SegmentedControl';

const OPTIONS = [
  { value: 'day', label: '24h' },
  { value: 'week', label: '7d' },
  { value: 'month', label: '30d' },
] as const;

type Range = (typeof OPTIONS)[number]['value'];

/**
 * @summary Pick exactly one of a few views. §6c States, Selected: the chosen segment takes the accent tint plus a 2px accent underline, so selected is not colour alone.
 */
const meta = {
  title: 'ui/SegmentedControl',
  component: SegmentedControl<Range>,
  tags: ['autodocs'],
  args: { label: 'Range', options: OPTIONS, value: 'week', onChange: () => {} },
  render: function Render(args) {
    const [value, setValue] = useState(args.value);
    return <SegmentedControl {...args} value={value} onChange={setValue} />;
  },
} satisfies Meta<typeof SegmentedControl<Range>>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Default: one segment on, picking it again is a no-op. */
export const Default: Story = {};

/** @summary Dense `sm` size. */
export const Small: Story = { args: { size: 'sm' } };

/** @summary `fill` stretches the group to its container, for a phone sheet. */
export const Fill: Story = { args: { fill: true } };

/** @summary `uppercase` off, for labels that are units or codes. */
export const MixedCase: Story = {
  args: {
    uppercase: false,
    options: [
      { value: 'day', label: 'Day' },
      { value: 'week', label: 'Week' },
      { value: 'month', label: 'Month' },
    ],
  },
};

/** @summary Disabled segment with a reason (§6c States, Disabled): `aria-disabled` keeps it focusable so the tooltip can say why. */
export const DisabledWithReason: Story = {
  args: {
    options: [
      { value: 'day', label: '24h' },
      { value: 'week', label: '7d' },
      { value: 'month', label: '30d', disabled: true, disabledReason: 'Needs 30 days of history' },
    ],
  },
};
