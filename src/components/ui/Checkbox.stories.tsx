import type { Meta, StoryObj } from '@storybook/react-vite';
import { Checkbox } from './Checkbox';

const meta = {
  title: 'ui/Checkbox',
  component: Checkbox,
  tags: ['autodocs'],
  render: (args) => (
    <label className="inline-flex items-center gap-2 text-sm">
      <Checkbox {...args} />
      Hide bait sells
    </label>
  ),
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unchecked: Story = {};

export const Checked: Story = { args: { defaultChecked: true } };

export const Disabled: Story = { args: { disabled: true, defaultChecked: true } };

export const NoLabel: Story = {
  tags: ['!manifest'],
  render: (args) => <Checkbox {...args} />,
};
