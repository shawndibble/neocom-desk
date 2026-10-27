import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from './Select';

/**
 * @summary Radix Select compound (`Select`, `SelectTrigger`, `SelectContent`, `SelectItem`). §6c cue: `CaretDown` inside field chrome opens a list to pick from.
 */
const meta = {
  title: 'ui/Select',
  component: Select,
  tags: ['autodocs'],
  args: { defaultValue: 'jita' },
  render: (args) => (
    <Select {...args}>
      <SelectTrigger aria-label="Hub" className="w-56">
        <SelectValue placeholder="Pick a hub" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="jita">Jita</SelectItem>
        <SelectItem value="amarr">Amarr</SelectItem>
        <SelectItem value="dodixie">Dodixie</SelectItem>
      </SelectContent>
    </Select>
  ),
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Closed trigger with a value: the trailing `CaretDown` is the "opens a list" cue (§6c). */
export const Closed: Story = {};

/** @summary No value yet: the placeholder reads dim. */
export const Placeholder: Story = { args: { defaultValue: undefined } };

/** @summary Open list: the picked option carries a check; the keyboard-highlighted one takes the inset accent outline plus `panel-2` fill (§6c States, Highlighted option). */
export const Open: Story = { args: { defaultOpen: true } };

/** @summary Disabled (§6c States): `opacity-40`, not openable. */
export const Disabled: Story = { args: { disabled: true } };

/** @summary Grouped options with a `SelectLabel` per group, announced as the group name rather than an option. */
export const Grouped: Story = {
  args: { defaultOpen: true },
  render: (args) => (
    <Select {...args}>
      <SelectTrigger aria-label="Hub" className="w-56">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Empire</SelectLabel>
          <SelectItem value="jita">Jita</SelectItem>
          <SelectItem value="amarr">Amarr</SelectItem>
        </SelectGroup>
        <SelectGroup>
          <SelectLabel>Nullsec</SelectLabel>
          <SelectItem value="1dq">1DQ1-A</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  ),
};
