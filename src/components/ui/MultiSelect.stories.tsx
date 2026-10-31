import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { MultiSelect, type MultiSelectProps } from './MultiSelect';

const OPTIONS = [
  { id: 'jita', label: 'Jita' },
  { id: 'amarr', label: 'Amarr' },
  { id: 'dodixie', label: 'Dodixie' },
  { id: 'rens', label: 'Rens' },
];

type Id = string;

function Stateful(args: MultiSelectProps<Id>) {
  const [selected, setSelected] = useState<ReadonlySet<Id>>(args.selected);
  return (
    <MultiSelect
      {...args}
      selected={selected}
      onToggle={(id) =>
        setSelected((prev) => {
          const next = new Set(prev);
          if (!next.delete(id)) next.add(id);
          return next;
        })
      }
    />
  );
}

/** Opens the popover the way a pilot does, so the state is reachable in Storybook. */
const openPopover: Story['play'] = async ({ canvasElement }) => {
  await userEvent.click(within(canvasElement).getByRole('button'));
  await expect(within(document.body).getByRole('searchbox')).toBeInTheDocument();
};

/**
 * @summary Searchable many-of-many picker in a popover, with a type-to-filter box and keyboard highlight. §6c cue: `CaretDown` inside field chrome opens a list to pick from.
 */
const meta = {
  title: 'ui/MultiSelect',
  component: MultiSelect<Id>,
  tags: ['autodocs'],
  args: {
    summary: '1 / 4',
    triggerAriaLabel: 'Hubs, 1 of 4 picked',
    options: OPTIONS,
    selected: new Set(['jita']),
    onToggle: () => {},
    label: 'Hubs',
    searchPlaceholder: 'Search hubs',
    noResultsLabel: 'No hubs match',
  },
  render: (args) => <Stateful {...args} />,
} satisfies Meta<typeof MultiSelect<Id>>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Closed: the standard select-shaped trigger, the field name and a dim count of the picks, with `SelectTrigger`'s border, height, text case and chevron. */
export const Closed: Story = {};

/** @summary Open with one option ticked; the ticked options carry a check, not colour alone (§6c States, Selected). */
export const Open: Story = { play: openPopover };

/** @summary `sm` trigger whose visible text names itself ("All hubs"), for a dense filter row. */
export const SmallSelfNamedTrigger: Story = {
  args: {
    size: 'sm',
    triggerLabel: 'All hubs',
    summary: undefined,
    triggerAriaLabel: undefined,
    selected: new Set(),
  },
};

/** @summary Grouped options under non-selectable group headings. */
export const Grouped: Story = {
  args: {
    options: undefined,
    groups: [
      { label: 'Empire', options: OPTIONS.slice(0, 2) },
      { label: 'Lowsec', options: OPTIONS.slice(2) },
    ],
  },
  play: openPopover,
};

/** @summary Empty result: the filter matches nothing, so `noResultsLabel` shows instead of a blank list (§6c States, empty). */
export const NoResults: Story = {
  play: async (context) => {
    await openPopover(context);
    await userEvent.type(within(document.body).getByRole('searchbox'), 'zzz');
  },
};

/** Tickable group headings: ticking a heading ticks every row under it. */
export const TickableHeadings: Story = {
  args: {
    summary: undefined,
    triggerAriaLabel: undefined,
    options: undefined,
    selected: new Set(['jita']),
    groups: [
      {
        label: 'The Forge',
        options: [{ id: 'jita', label: 'Jita' }],
      },
      {
        label: 'Domain',
        options: [{ id: 'amarr', label: 'Amarr' }],
      },
    ],
    groupState: () => false,
    onToggleGroup: () => {},
  },
  play: openPopover,
};
