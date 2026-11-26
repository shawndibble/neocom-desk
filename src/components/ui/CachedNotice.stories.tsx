import type { Meta, StoryObj } from '@storybook/react-vite';
import { CachedNotice } from './CachedNotice';
import { MINUTE_MS } from '@/lib/age';

const ago = (minutes: number) => Date.now() - minutes * MINUTE_MS;

const meta = {
  title: 'ui/CachedNotice',
  component: CachedNotice,
  tags: ['autodocs'],
  args: { fetchedAt: ago(180) },
} satisfies Meta<typeof CachedNotice>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Cached: Story = {};

export const RefreshFailed: Story = { args: { refreshFailed: true } };

export const UnknownAge: Story = { args: { fetchedAt: null } };
