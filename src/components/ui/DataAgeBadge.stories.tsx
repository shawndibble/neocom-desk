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

export const Fresh: Story = {};

export const Stale: Story = { args: { date: ago(180) } };

export const VeryStale: Story = { args: { date: ago(60 * 30) } };

export const DotOnly: Story = { args: { dotOnly: true } };

export const WithNote: Story = { args: { note: 'CCP caches corp data for about an hour.' } };

export const WithEsiExpiry: Story = {
  args: { expiresAt: new Date(Date.now() + 23 * MINUTE_MS) },
};

export const EsiExpiryPassed: Story = {
  args: { expiresAt: new Date(Date.now() - 5 * MINUTE_MS) },
};
