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

export const Off: Story = {};

export const On: Story = { args: { selected: true } };

export const WithCount: Story = { args: { count: 3, countLabel: 'unread' } };

export const DisabledWithReason: Story = {
  args: { disabled: true, tooltip: 'Needs the Director role.' },
};
