import type { Meta, StoryObj } from '@storybook/react-vite';
import { NativeSelect } from './NativeSelect';

/**
 * @summary Browser `<select>` in field chrome, for long or phone-friendly lists. §6c cue: `CaretDown` inside field chrome opens a list to pick from.
 */
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

/** @summary Resting select with the trailing `CaretDown` cue (§6c). The native list opens on click and cannot be pre-opened. */
export const Default: Story = {};

/** @summary Dense `sm` size. */
export const Small: Story = { args: { size: 'sm' } };

/** @summary Invalid (§6c States): `aria-invalid` turns the border to the danger token. */
export const Invalid: Story = { args: { 'aria-invalid': true } };

/** @summary Disabled (§6c States): `opacity-40` and `cursor-not-allowed`. */
export const Disabled: Story = { args: { disabled: true } };
