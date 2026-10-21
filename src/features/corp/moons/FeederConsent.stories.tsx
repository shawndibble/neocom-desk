import type { Meta, StoryObj } from '@storybook/react-vite';
import type { FeederInvitePreview } from '../taxBook/feederClient';
import { FeederConsent } from './FeederConsent';

/** @summary What an accounting corporation will see, what it cannot do, how to stop it, and the one optional rate. */
const meta = {
  title: 'corp/FeederConsent',
  component: FeederConsent,
  parameters: { layout: 'padded' },
  args: {
    characterId: 1,
    code: 'abc123DEF456',
    busy: false,
    onContinue: () => {},
    onBack: () => {},
    loadPreview: async (): Promise<FeederInvitePreview> => ({
      collectorCorporationId: 5,
      collectorName: 'Brass Meridian Logistics',
      offeredOwnerRatePct: 8,
    }),
  },
} satisfies Meta<typeof FeederConsent>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary The link names the accounting corporation and the rate it offers. */
export const WithOffer: Story = {};

/** @summary The link offers no rate. */
export const NoOffer: Story = {
  args: {
    loadPreview: async () => ({
      collectorCorporationId: 5,
      collectorName: 'Brass Meridian Logistics',
      offeredOwnerRatePct: null,
    }),
  },
};

/** @summary The link is no longer valid: Continue is off. */
export const InvalidLink: Story = {
  args: {
    loadPreview: () =>
      Promise.reject(Object.assign(new Error('gone'), { details: { reason: 'invite-invalid' } })),
  },
};

/** @summary The EVE login could not start. */
export const LoginFailed: Story = {
  args: { error: 'Could not connect. Try again, or ask for a new invite link.' },
};
