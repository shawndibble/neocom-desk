import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { userEvent, within } from 'storybook/test';
import { CheckboxSelect, type CheckboxSelectProps } from './CheckboxSelect';

type Value = string;

const OPTIONS = [
  { value: 'frigate', label: 'Frigates' },
  { value: 'cruiser', label: 'Cruisers', description: 'Tech 1 and Tech 2' },
  { value: 'battleship', label: 'Battleships' },
];

function Stateful(args: CheckboxSelectProps<Value>) {
  const [selected, setSelected] = useState<ReadonlySet<Value>>(args.selected);
  return (
    <CheckboxSelect
      {...args}
      selected={selected}
      onToggle={(value) =>
        setSelected((prev) => {
          const next = new Set(prev);
          if (!next.delete(value)) next.add(value);
          return next;
        })
      }
    />
  );
}

/**
 * @summary Compact multi-pick filter in a dropdown menu, summarised as "All", a name, or a count. §6c cue: `CaretDown` inside field chrome opens a list to pick from.
 */
const meta = {
  title: 'ui/CheckboxSelect',
  component: CheckboxSelect<Value>,
  tags: ['autodocs'],
  args: {
    label: 'Hull class',
    options: OPTIONS,
    selected: new Set(['frigate', 'cruiser', 'battleship']),
    onToggle: () => {},
  },
  render: (args) => <Stateful {...args} />,
} satisfies Meta<typeof CheckboxSelect<Value>>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Everything ticked: the summary reads "All". */
export const All: Story = {};

/** @summary One ticked: the summary names it. */
export const One: Story = { args: { selected: new Set(['cruiser']) } };

/** @summary Several ticked: the summary is a count. */
export const Count: Story = { args: { selected: new Set(['frigate', 'cruiser']) } };

/** @summary Nothing ticked: the summary reads "None". */
export const None: Story = { args: { selected: new Set() } };

/** @summary Open menu: checked items carry a check, options can carry a dim description. */
export const Open: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button'));
  },
};

/** @summary `size="md"`: the 36px height of a `SearchInput` beside it, for a filter row built at the default size. */
export const Medium: Story = { args: { size: 'md' } };
