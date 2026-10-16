import type { Meta, StoryObj } from '@storybook/react-vite';
import { ReauthBanner } from './ReauthBanner';

/**
 * Warning title, hint and one login action. Cue (§6c): an amber title marks a
 * read that needs the pilot to grant access again; the button is the fix.
 *
 * @summary Prompt to log in again or grant a missing Permission.
 */
const meta = {
  title: 'ui/ReauthBanner',
  component: ReauthBanner,
  tags: ['autodocs'],
  args: {
    title: 'Access needed',
    hint: 'Neocom Desk needs your permission to read this Character’s assets.',
    actionLabel: 'Log in with EVE',
    onLogin: () => {},
  },
} satisfies Meta<typeof ReauthBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Button cue (§5): `primary` when the banner replaces the view's content. */
export const Primary: Story = {};

/** @summary Button cue (§5): `ghost` beside a view that already has its own primary button. */
export const Ghost: Story = { args: { variant: 'ghost' } };

/** @summary Touch tier (§3): `soleAction` raises the button to `md` when it is the only control. */
export const SoleAction: Story = { args: { soleAction: true } };

/** @summary `compact`: one wrapped line beside saved data, shown when a lapsed grant must not hide what is already on this device. */
export const Compact: Story = {
  args: {
    compact: true,
    variant: 'ghost',
    title: 'Log in again to refresh.',
    hint: "EVE access for this data has lapsed, so what's saved on this device is shown.",
  },
};
