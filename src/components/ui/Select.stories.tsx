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

export const Active: Story = {
  render: (args) => (
    <Select {...args}>
      <SelectTrigger aria-label="Hub" className="w-56" active>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="jita">Jita</SelectItem>
      </SelectContent>
    </Select>
  ),
};

export const Closed: Story = {};

export const Placeholder: Story = { args: { defaultValue: undefined } };

export const Open: Story = { args: { defaultOpen: true } };

export const Disabled: Story = { args: { disabled: true } };

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
