import type { Meta, StoryObj } from '@storybook/react-vite';
import { RefineryNamesBanner } from './RefineryNamesBanner';

/** @summary The optional prompt on a moon owner's page to grant again so refinery names show. */
const meta = {
  title: 'corp/RefineryNamesBanner',
  component: RefineryNamesBanner,
  args: { onGrant: () => {} },
} satisfies Meta<typeof RefineryNamesBanner>;

export default meta;

/** @summary Quiet one-line prompt with Grant again. */
export const Default: StoryObj<typeof meta> = {};
