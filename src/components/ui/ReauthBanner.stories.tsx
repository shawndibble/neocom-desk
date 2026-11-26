import type { Meta, StoryObj } from '@storybook/react-vite';
import { ReauthBanner } from './ReauthBanner';

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

export const Primary: Story = {};

export const Ghost: Story = { args: { variant: 'ghost' } };

export const SoleAction: Story = { args: { soleAction: true } };

export const Compact: Story = {
  args: {
    compact: true,
    variant: 'ghost',
    title: 'Log in again to refresh.',
    hint: "EVE access for this data has lapsed, so what's saved on this device is shown.",
  },
};
