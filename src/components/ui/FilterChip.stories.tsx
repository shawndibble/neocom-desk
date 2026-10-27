import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { FilterChip } from './FilterChip';

const meta = {
  title: 'ui/FilterChip',
  component: FilterChip,
  tags: ['autodocs'],
  args: { label: 'Unread', selected: false, onToggle: () => {} },
  render: function Render(args) {
    const [selected, setSelected] = useState(args.selected);
    return <FilterChip {...args} selected={selected} onToggle={() => setSelected((s) => !s)} />;
  },
} satisfies Meta<typeof FilterChip>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Off: hairline border. Click to turn it on. */
export const Off: Story = {};

/** @summary On: accent tint, `aria-pressed`. */
export const On: Story = { args: { selected: true } };

/** @summary A match count after the label, with a screen-reader gloss saying what it counts. */
export const WithCount: Story = { args: { count: 3, countLabel: 'unread' } };

/** @summary Disabled with a tooltip giving the reason; stays hoverable. */
export const DisabledWithReason: Story = {
  args: { disabled: true, tooltip: 'Needs the Director role.' },
};
