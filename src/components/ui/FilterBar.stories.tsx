import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { FilterBar, FilterField, type ActiveFilter } from './FilterBar';
import { FilterChip } from './FilterChip';
import { IconButton } from './IconButton';
import * as Icon from './icons';
import { SearchInput } from './SearchInput';
import { TextInput } from './TextInput';

const SPACES = ['Highsec', 'Lowsec', 'Nullsec'] as const;
type Space = (typeof SPACES)[number];

interface Filters {
  unreadOnly: boolean;
  space: readonly Space[];
  minReward: string;
  hideRisky: boolean;
}

const DEFAULTS: Filters = { unreadOnly: false, space: SPACES, minReward: '', hideRisky: false };

/** The route's half of the contract: which filters are on, in a few words each. */
function activeFilters(value: Filters): ActiveFilter<Filters>[] {
  const active: ActiveFilter<Filters>[] = [];
  if (value.space.length < SPACES.length)
    active.push({
      label: 'Space',
      value: value.space.join(', ') || 'None',
      clear: (v) => ({ ...v, space: DEFAULTS.space }),
    });
  if (value.minReward)
    active.push({
      label: 'Min reward',
      value: `≥ ${value.minReward}`,
      clear: (v) => ({ ...v, minReward: '' }),
    });
  if (value.unreadOnly)
    active.push({ label: 'Unread only', clear: (v) => ({ ...v, unreadOnly: false }) });
  if (value.hideRisky)
    active.push({ label: 'Hide risky routes', clear: (v) => ({ ...v, hideRisky: false }) });
  return active;
}

const meta = {
  title: 'ui/FilterBar',
  component: FilterBar<Filters>,
  tags: ['autodocs'],
  args: {
    value: DEFAULTS,
    onChange: () => {},
    search: <SearchInput aria-label="Search" placeholder="Search" className="w-64" />,
    children: () => null,
  },
  render: function Render(args) {
    const [value, setValue] = useState<Filters>(args.value);
    return (
      <FilterBar<Filters> {...args} value={value} onChange={setValue} active={activeFilters(value)}>
        {(draft, setDraft) => (
          <>
            <FilterField label="Space" stretch={false}>
              <div role="group" aria-label="Space" className="flex gap-2">
                {SPACES.map((space) => (
                  <FilterChip
                    key={space}
                    label={space}
                    selected={draft.space.includes(space)}
                    onToggle={() =>
                      setDraft({
                        ...draft,
                        space: draft.space.includes(space)
                          ? draft.space.filter((s) => s !== space)
                          : SPACES.filter((s) => s === space || draft.space.includes(s)),
                      })
                    }
                  />
                ))}
              </div>
            </FilterField>
            <FilterField label="Min reward">
              <TextInput
                aria-label="Min reward"
                size="sm"
                className="w-28"
                value={draft.minReward}
                onChange={(event) => setDraft({ ...draft, minReward: event.target.value })}
              />
            </FilterField>
            <FilterField label="Unread only" stretch={false}>
              <FilterChip
                label="Unread"
                selected={draft.unreadOnly}
                onToggle={() => setDraft({ ...draft, unreadOnly: !draft.unreadOnly })}
              />
            </FilterField>
            <FilterField label="Hide risky routes" stretch={false} hideCaption>
              <FilterChip
                label="Hide risky routes"
                selected={draft.hideRisky}
                onToggle={() => setDraft({ ...draft, hideRisky: !draft.hideRisky })}
              />
            </FilterField>
          </>
        )}
      </FilterBar>
    );
  },
} satisfies Meta<typeof FilterBar<Filters>>;

export default meta;
type Story = StoryObj<typeof meta>;

const FILTERED: Filters = {
  unreadOnly: true,
  space: ['Highsec', 'Lowsec'],
  minReward: '50m',
  hideRisky: true,
};

/** @summary Search plus a funnel. Desktop: filters open in a box under the row and apply at once. */
export const Desktop: Story = {};

/**
 * @summary Filters on: one line of pills under the row, then Clear all. The funnel slides the box into the pills' slot, so nothing shows twice.
 */
export const WithActiveFilters: Story = { args: { value: FILTERED } };

/** @summary A narrow panel: the pills that do not fit fold into "+N" rather than wrapping. */
export const ActiveFiltersOverflow: Story = {
  args: { value: FILTERED },
  decorators: [
    (Story) => (
      <div style={{ width: 380 }}>
        <Story />
      </div>
    ),
  ],
};

/** @summary At 390 wide the funnel opens a bottom sheet; each pick applies at once, and its footer says how many rows are left. */
export const PhoneSheet: Story = {
  args: { value: FILTERED, resultCount: 312 },
  globals: { viewport: { value: 'phone390', isRotated: false } },
};

/** @summary The funnel opens a popover anchored to it, for a panel title bar with no room beneath. No pill line. */
export const PopoverSurface: Story = { args: { pointerSurface: 'popover', value: FILTERED } };

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
