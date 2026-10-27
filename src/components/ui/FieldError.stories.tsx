import type { Meta, StoryObj } from '@storybook/react-vite';
import { FieldError } from './FieldError';
import { TextInput } from './TextInput';

/**
 * @summary Inline validation message in the danger tone. It is a `role="alert"`, so it is announced when it appears (§6c States, Invalid).
 */
const meta = {
  title: 'ui/FieldError',
  component: FieldError,
  tags: ['autodocs'],
  args: { id: 'budget-error', children: 'Enter an amount like 250m or 1.5b.' },
} satisfies Meta<typeof FieldError>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary The message alone. */
export const Default: Story = {};

/** @summary Wired to its field: `aria-invalid` plus `aria-describedby` pointing at the error's `id`. */
export const WithField: Story = {
  render: (args) => (
    <div className="flex flex-col gap-1">
      <TextInput aria-label="Budget" defaultValue="lots" aria-invalid aria-describedby={args.id} />
      <FieldError {...args} />
    </div>
  ),
};
