import type { Meta, StoryObj } from '@storybook/react-vite';
import { OwnerStaleBanner } from './OwnerStaleBanner';

/** @summary The stale-ledger banner on a moon owner's page, with Reconnect. */
const meta = {
  title: 'corp/OwnerStaleBanner',
  component: OwnerStaleBanner,
  args: { since: Date.UTC(2026, 9, 11), daysLeft: 21, onReconnect: () => {} },
} satisfies Meta<typeof OwnerStaleBanner>;

export default meta;

/** @summary Banner naming the day the ledger went unreadable. */
export const Default: StoryObj<typeof meta> = {};

/** @summary Past 30 days: the oldest unread ore is already lost for good. */
export const OreLost: StoryObj<typeof meta> = { args: { daysLeft: 0 } };
