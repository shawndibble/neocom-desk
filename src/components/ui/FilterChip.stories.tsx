import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { FilterChip } from './FilterChip';

/**
 * @summary Independent on/off filter toggle (`aria-pressed`). §6c States, Selected: a toggle takes the accent tint. Not for "exactly one of" (`SegmentedControl`).
 */
const meta = {
  title: 'ui/FilterChip',
  component: FilterChip,
  tags: ['autodocs'],
  args: { label: 'Frigates', selected: false, onToggle: () => {} },
  render: function Render(args) {
    const [selected, setSelected] = useState(args.selected);
    return <FilterChip {...args} selected={selected} onToggle={() => setSelected(!selected)} />;
  },
} satisfies Meta<typeof FilterChip>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Off. */
export const Off: Story = {};

/** @summary On: accent tint, distinct from hover (§6c States: selected must never look like hover). */
export const On: Story = { args: { selected: true } };

/** @summary `count` shows how many rows the filter matches. */
export const WithCount: Story = { args: { selected: true, count: 12, countLabel: 'matching' } };

/** @summary Disabled with a reason (§6c States, Disabled): `aria-disabled` plus a tooltip instead of the native attribute. */
export const DisabledWithReason: Story = {
  args: { disabled: true, tooltip: 'No frigates in this list' },
};

/** @summary Plain disabled: `opacity-40` and `cursor-not-allowed`. */
export const Disabled: Story = { args: { disabled: true } };
