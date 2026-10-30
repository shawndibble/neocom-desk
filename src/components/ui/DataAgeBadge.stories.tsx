import type { Meta, StoryObj } from '@storybook/react-vite';
import { DataAgeBadge } from './DataAgeBadge';
import { MINUTE_MS } from '@/lib/age';

const ago = (minutes: number) => new Date(Date.now() - minutes * MINUTE_MS);

const meta = {
  title: 'ui/DataAgeBadge',
  component: DataAgeBadge,
  tags: ['autodocs'],
  args: { date: ago(12), alwaysVisible: true },
} satisfies Meta<typeof DataAgeBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Fresh data: under an hour, dim text. */
export const Fresh: Story = {};

/** @summary Over an hour old: amber. */
export const Stale: Story = { args: { date: ago(180) } };

/** @summary Over a day old: red. */
export const VeryStale: Story = { args: { date: ago(60 * 30) } };

/** @summary Only the dot; the exact age moves into the tooltip. For tight rows. */
export const DotOnly: Story = { args: { dotOnly: true } };

/** @summary A sentence about this view's refresh cadence, added to the tooltip. */
export const WithNote: Story = { args: { note: 'CCP caches corp data for about an hour.' } };

/** @summary ESI's stored expiry is ahead: the tooltip adds when ESI next updates the data. */
export const WithEsiExpiry: Story = {
  args: { expiresAt: new Date(Date.now() + 23 * MINUTE_MS) },
};

/** @summary ESI's expiry has passed: the tooltip says newer data may exist. */
export const EsiExpiryPassed: Story = {
  args: { expiresAt: new Date(Date.now() - 5 * MINUTE_MS) },
};
