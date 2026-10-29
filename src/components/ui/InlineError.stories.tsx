import type { Meta, StoryObj } from '@storybook/react-vite';
import { InlineError } from './InlineError';

/**
 * Small danger text for an action that failed, announced to assistive tech. For
 * a field's own validation message use `FieldError`.
 *
 * @summary Announced inline failure message.
 */
const meta = {
  title: 'ui/InlineError',
  component: InlineError,
  tags: ['autodocs'],
} satisfies Meta<typeof InlineError>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Error cue (§6c): the message sits next to the control that failed. */
export const Default: Story = { args: { children: 'Could not send the mail. Try again.' } };
