import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { IskInput } from './IskInput';

const meta = {
  title: 'ui/IskInput',
  component: IskInput,
  tags: ['autodocs'],
  args: { 'aria-label': 'Budget', value: '', onChange: () => {} },
  render: function Render(args) {
    const [value, setValue] = useState(args.value);
    return <IskInput {...args} value={value} onChange={setValue} />;
  },
} satisfies Meta<typeof IskInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

export const Shorthand: Story = { args: { value: '1500000000' } };

export const DefaultAmount: Story = { args: { defaultAmount: 5_000_000 } };

export const Unparseable: Story = { args: { value: 'lots' } };

export const Disabled: Story = { args: { value: '250m', disabled: true } };
