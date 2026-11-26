import type { Meta, StoryObj } from '@storybook/react-vite';
import { NativeSelect } from './NativeSelect';

const meta = {
  title: 'ui/NativeSelect',
  component: NativeSelect,
  tags: ['autodocs'],
  args: {
    'aria-label': 'Hub',
    defaultValue: 'jita',
    children: (
      <>
        <option value="jita">Jita</option>
        <option value="amarr">Amarr</option>
        <option value="dodixie">Dodixie</option>
      </>
    ),
  },
} satisfies Meta<typeof NativeSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Small: Story = { args: { size: 'sm' } };

export const Invalid: Story = { args: { 'aria-invalid': true } };

export const Disabled: Story = { args: { disabled: true } };
