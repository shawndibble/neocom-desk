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

export const All: Story = {};

export const One: Story = { args: { selected: new Set(['cruiser']) } };

export const Count: Story = { args: { selected: new Set(['frigate', 'cruiser']) } };

export const Active: Story = {
  args: { selected: new Set(['cruiser']), active: true },
};

export const None: Story = { args: { selected: new Set() } };

export const Open: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button'));
  },
};

export const Medium: Story = { args: { size: 'md' } };

export const NoneLabel: Story = { args: { selected: new Set(), noneLabel: 'Any' } };

export const DisabledOption: Story = {
  args: {
    selected: new Set(['frigate']),
    options: [
      { value: 'frigate', label: 'Frigates', disabled: true },
      { value: 'cruiser', label: 'Cruisers', description: 'Tech 1 and Tech 2', disabled: true },
      { value: 'battleship', label: 'Battleships' },
    ],
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button'));
  },
};
