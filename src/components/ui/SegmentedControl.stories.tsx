import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { SegmentedControl } from './SegmentedControl';

const options = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

const meta = {
  title: 'ui/SegmentedControl',
  component: SegmentedControl<string>,
  tags: ['autodocs'],
  args: { label: 'Range', options, value: 'week', onChange: () => {} },
  render: function Render(args) {
    const [value, setValue] = useState(args.value);
    return <SegmentedControl {...args} value={value} onChange={setValue} />;
  },
} satisfies Meta<typeof SegmentedControl<string>>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Exactly one of a few views is always on. */
export const Basic: Story = {};

/** @summary Stretches to the container, segments sharing the width. Useful on a phone. */
export const Fill: Story = {
  args: { fill: true },
  globals: { viewport: { value: 'phone390', isRotated: false } },
};

/** @summary One segment disabled, with the reason in a tooltip. */
export const DisabledSegment: Story = {
  args: {
    options: [
      options[0],
      options[1],
      { value: 'month', label: 'Month', disabled: true, disabledReason: 'No data yet.' },
    ],
  },
};
