import type { Meta, StoryObj } from '@storybook/react-vite';
import { TextInput } from './TextInput';

/**
 * @summary Single-line text field. Field chrome: a box sized like a field marks a control (§6c cue vocabulary).
 */
const meta = {
  title: 'ui/TextInput',
  component: TextInput,
  tags: ['autodocs'],
  args: { 'aria-label': 'Plan name', placeholder: 'Rifter run' },
} satisfies Meta<typeof TextInput>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Resting field at the default `md` touch-tier height (§6c States: field border visible at rest). */
export const Default: Story = {};

/** @summary Dense `sm` size for toolbars and filter rows. */
export const Small: Story = { args: { size: 'sm' } };

/** @summary Filled value: text takes the full `text` token, not the placeholder dim. */
export const Filled: Story = { args: { defaultValue: 'Rifter run' } };

/** @summary Invalid field (§6c States): `aria-invalid` turns the border to the danger token. Pair with `FieldError`. */
export const Invalid: Story = { args: { defaultValue: 'x', 'aria-invalid': true } };

/** @summary Disabled (§6c States): `opacity-40` and `cursor-not-allowed`. */
export const Disabled: Story = { args: { disabled: true, defaultValue: 'Locked' } };

/** @summary Anti-pattern: a placeholder with no label or `aria-label` leaves the field unnamed once typed in (§6c States, WCAG 3.3.2). */
export const NoLabel: Story = {
  tags: ['!manifest'],
  args: { 'aria-label': undefined },
};
