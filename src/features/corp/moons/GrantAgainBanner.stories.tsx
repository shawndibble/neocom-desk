import type { Meta, StoryObj } from '@storybook/react-vite';
import { GrantAgainBanner } from './GrantAgainBanner';

/** @summary The optional prompt on a moon owner's page to grant again so refinery names and each chunk's ore show. */
const meta = {
  title: 'corp/GrantAgainBanner',
  component: GrantAgainBanner,
  args: { lacks: 'names', onGrant: () => {} },
} satisfies Meta<typeof GrantAgainBanner>;

export default meta;

/** @summary A grant from before refinery names were read. */
export const Default: StoryObj<typeof meta> = {};

/** @summary A grant from before the Extraction notices were read: chunks show no ore. */
export const ChunkOre: StoryObj<typeof meta> = { args: { lacks: 'ore' } };

/** @summary A grant from before both. */
export const Both: StoryObj<typeof meta> = { args: { lacks: 'both' } };
