import type { Meta, StoryObj } from '@storybook/react-vite';
import { TextArea } from './TextArea';

/**
 * @summary Multi-line text field. Same field chrome as `TextInput` (§6c: a box sized like a field marks a control).
 */
const meta = {
  title: 'ui/TextArea',
  component: TextArea,
  tags: ['autodocs'],
  args: { 'aria-label': 'Notes', rows: 4, placeholder: 'Anything to remember about this plan' },
} satisfies Meta<typeof TextArea>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Resting multi-line field. */
export const Default: Story = {};

/** @summary `mono` for pasted game data (fittings, scan results). */
export const Mono: Story = {
  args: { mono: true, defaultValue: '[Rifter, Fit]\nDamage Control II' },
};

/** @summary `onSubmitChord`: Ctrl or Cmd plus Enter submits, plain Enter stays a newline. */
export const SubmitChord: Story = { args: { onSubmitChord: () => {} } };

/** @summary Invalid (§6c States): `aria-invalid` turns the border to the danger token. */
export const Invalid: Story = { args: { defaultValue: 'bad paste', 'aria-invalid': true } };

/** @summary Disabled (§6c States): `opacity-40` and `cursor-not-allowed`. */
export const Disabled: Story = { args: { disabled: true, defaultValue: 'Locked' } };
