import type { Meta, StoryObj } from '@storybook/react-vite';
import { OwnerStaleBanner } from './OwnerStaleBanner';

const meta = {
  title: 'corp/OwnerStaleBanner',
  component: OwnerStaleBanner,
  args: { since: Date.UTC(2026, 9, 11), daysLeft: 21, onReconnect: () => {} },
} satisfies Meta<typeof OwnerStaleBanner>;

export default meta;

export const Default: StoryObj<typeof meta> = {};

export const OreLost: StoryObj<typeof meta> = { args: { daysLeft: 0 } };
