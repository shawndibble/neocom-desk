import type { Meta, StoryObj } from '@storybook/react-vite';
import { ShareMark } from './ShareMark';

/**
 * A row's "shared with others" mark: the accent share glyph, its tooltip naming who sees it.
 * Cue (§6c "A share mark on a row"): `off` dims and slashes it, so colour is never the only
 * signal; `to` makes it a link to where the sharing is set.
 *
 * @summary Share mark on a shared row; slashed when sharing was turned off for it.
 */
const meta = {
  title: 'ui/ShareMark',
  component: ShareMark,
  tags: ['autodocs'],
  args: { label: 'Pops shared with Corp, Alliance' },
} satisfies Meta<typeof ShareMark>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Shared: accent glyph, tooltip lists the audiences. */
export const Shared: Story = {};

/** @summary Off: dimmed and slashed (a moon owner opted out). */
export const Off: Story = { args: { off: true, label: 'Moon owner turned sharing off' } };

/** @summary Linked: opens where the sharing is set. */
export const Linked: Story = { args: { to: '/corp/moons/sharing?highlight=7' } };
