import type { Meta, StoryObj } from '@storybook/react-vite';
import { GrantAgainBanner } from './GrantAgainBanner';

const meta = {
  title: 'corp/GrantAgainBanner',
  component: GrantAgainBanner,
  args: { lacks: 'names', onGrant: () => {} },
} satisfies Meta<typeof GrantAgainBanner>;

export default meta;

export const Default: StoryObj<typeof meta> = {};

export const ChunkOre: StoryObj<typeof meta> = { args: { lacks: 'ore' } };

export const Both: StoryObj<typeof meta> = { args: { lacks: 'both' } };
