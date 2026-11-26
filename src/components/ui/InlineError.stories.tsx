import type { Meta, StoryObj } from '@storybook/react-vite';
import { InlineError } from './InlineError';

const meta = {
  title: 'ui/InlineError',
  component: InlineError,
  tags: ['autodocs'],
} satisfies Meta<typeof InlineError>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { children: 'Could not send the mail. Try again.' } };
