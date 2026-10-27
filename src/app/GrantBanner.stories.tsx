import type { Meta, StoryObj } from '@storybook/react-vite';
import { GrantBanner } from './GrantNote';

/**
 * A `ReauthBanner` whose action grants the Permission behind `endpoints`.
 * Cue (§6c): amber title, one button that fixes it. `GrantNote` is skipped: it
 * reads the active Character and Dexie.
 *
 * @summary Banner asking the pilot to grant a missing ESI Permission.
 */
const meta = {
  title: 'app/GrantBanner',
  component: GrantBanner,
  tags: ['autodocs'],
  args: {
    characterId: 1,
    endpoints: ['getCharacterAssets'] as const,
    title: 'Assets need permission',
    hint: 'Grant asset access to see where your items are.',
    actionLabel: 'Grant access',
  },
} satisfies Meta<typeof GrantBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Banner (§6c): a single Character, plain title. */
export const Default: Story = {};

/** @summary Banner (§6c): `characterName` prefixes the title where several banners stack. */
export const Named: Story = { args: { characterName: 'Shawn Dibble' } };
