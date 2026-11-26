import type { Meta, StoryObj } from '@storybook/react-vite';
import { FieldError } from './FieldError';
import { TextInput } from './TextInput';

const meta = {
  title: 'ui/FieldError',
  component: FieldError,
  tags: ['autodocs'],
  args: { id: 'budget-error', children: 'Enter an amount like 250m or 1.5b.' },
} satisfies Meta<typeof FieldError>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithField: Story = {
  render: (args) => (
    <div className="flex flex-col gap-1">
      <TextInput aria-label="Budget" defaultValue="lots" aria-invalid aria-describedby={args.id} />
      <FieldError {...args} />
    </div>
  ),
};
