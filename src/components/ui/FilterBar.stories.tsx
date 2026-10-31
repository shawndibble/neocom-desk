import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { FilterBar, FilterField } from './FilterBar';
import { FilterChip } from './FilterChip';
import { IconButton } from './IconButton';
import * as Icon from './icons';
import { SearchInput } from './SearchInput';

interface Filters {
  unreadOnly: boolean;
}

const meta = {
  title: 'ui/FilterBar',
  component: FilterBar<Filters>,
  tags: ['autodocs'],
  args: {
    value: { unreadOnly: false },
    onChange: () => {},
    search: <SearchInput aria-label="Search" placeholder="Search" className="w-64" />,
    children: () => null,
  },
  render: function Render(args) {
    const [value, setValue] = useState<Filters>(args.value);
    return (
      <FilterBar<Filters>
        {...args}
        value={value}
        onChange={setValue}
        activeCount={value.unreadOnly ? 1 : 0}
      >
        {(draft, setDraft) => (
          <FilterField label="Status" stretch={false}>
            <FilterChip
              label="Unread"
              selected={draft.unreadOnly}
              onToggle={() => setDraft({ ...draft, unreadOnly: !draft.unreadOnly })}
            />
          </FilterField>
        )}
      </FilterBar>
    );
  },
} satisfies Meta<typeof FilterBar<Filters>>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Search plus a funnel. Desktop: filters open in a box under the row and apply at once. */
export const Desktop: Story = {};

/** @summary At 390 wide the funnel opens a bottom sheet; each pick applies at once. */
export const PhoneSheet: Story = {
  globals: { viewport: { value: 'phone390', isRotated: false } },
};

/** @summary The funnel opens a popover anchored to it, for a panel title bar with no room beneath. */
export const PopoverSurface: Story = { args: { pointerSurface: 'popover' } };

/** @summary `trailing` view controls after the funnel, so the funnel sits beside the search box. */
export const WithTrailing: Story = {
  args: {
    trailing: (
      <>
        <IconButton icon={<Icon.ExpandAll />} label="Expand all" />
        <IconButton icon={<Icon.CollapseAll />} label="Collapse all" />
      </>
    ),
  },
};
