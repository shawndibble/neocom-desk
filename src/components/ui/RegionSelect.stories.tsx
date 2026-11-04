import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { RegionSelect } from './RegionSelect';

const REGIONS = [
  { id: 10000002, name: 'The Forge' },
  { id: 10000043, name: 'Domain' },
  { id: 10000032, name: 'Sinq Laison' },
  { id: 10000030, name: 'Heimatar' },
];

const meta = {
  title: 'ui/RegionSelect',
  component: RegionSelect,
  tags: ['autodocs'],
  args: {
    options: REGIONS,
    value: null,
    onChange: () => {},
    allLabel: 'All regions',
    searchPlaceholder: 'Search regions…',
    noResultsLabel: 'No matching regions',
    'aria-label': 'From region',
    className: 'w-44',
  },
  render: function Render(args) {
    const [value, setValue] = useState(args.value);
    return <RegionSelect {...args} value={value} onChange={setValue} />;
  },
} satisfies Meta<typeof RegionSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary A type-to-filter region picker with an "All regions" row on top. */
export const Default: Story = {};

/** @summary A pinned shortcut row above the list that resolves to one region (open the picker to see it). */
export const WithShortcut: Story = {
  args: { shortcut: { label: 'From my region', onSelect: () => 10000002 } },
};

/** @summary The shortcut disabled, with the reason drawn under it. */
export const ShortcutDisabledWithNote: Story = {
  args: {
    shortcut: {
      label: 'From my region',
      disabled: true,
      note: 'Your current location is unavailable',
      onSelect: () => null,
    },
  },
};
