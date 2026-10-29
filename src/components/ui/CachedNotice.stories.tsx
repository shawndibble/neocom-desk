import type { Meta, StoryObj } from '@storybook/react-vite';
import { CachedNotice } from './CachedNotice';
import { MINUTE_MS } from '@/lib/age';

const ago = (minutes: number) => Date.now() - minutes * MINUTE_MS;

/**
 * The line above a view's content while that content is a cached read. Cue
 * (§6c): amber micro-caps "Showing cached data · 3h ago", shown at every
 * width, phones included, where the `DataAgeBadge` is hidden. Render it only
 * while the result is `fromCache`.
 *
 * @summary "Showing cached data · 3h ago" line for a cached read, at every width (the phone answer to the md-hidden DataAgeBadge).
 */
const meta = {
  title: 'ui/CachedNotice',
  component: CachedNotice,
  tags: ['autodocs'],
  args: { fetchedAt: ago(180) },
} satisfies Meta<typeof CachedNotice>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Offline (or the network is down): the saved copy and its age. */
export const Cached: Story = {};

/** @summary A refresh was attempted and failed; the age says how old what is shown is. */
export const RefreshFailed: Story = { args: { refreshFailed: true } };

/** @summary The loader does not know when the data was fetched: the sentence alone. */
export const UnknownAge: Story = { args: { fetchedAt: null } };
