import type { Meta, StoryObj } from '@storybook/react-vite';
import { seedVettingCorporation, vettingShellRoutes } from '@/storybook/vettingShell';
import { withSampleVetting } from '@/storybook/withSampleVetting';
import { VETTING_SCOPES } from '@/auth/vettingScopes';
import { VettingRequest } from './VettingRequest';

const routes = vettingShellRoutes([]);

/**
 * `/vetting`, a member's side of a promotion review: who asked and for which role, the
 * characters on this device, Share or Decline. The real route in the app shell, against the
 * in-memory `vettingFixture` backend.
 */
const meta = {
  title: 'pages/VettingRequest',
  component: VettingRequest,
  decorators: [withSampleVetting],
  parameters: {
    layout: 'fullscreen',
    vetting: { request: true },
    // The sample Characters' device logins cover everything a report reads.
    shell: { path: '/vetting', routes, scopes: VETTING_SCOPES, seed: seedVettingCorporation },
  },
} satisfies Meta<typeof VettingRequest>;

export default meta;
type Story = StoryObj<typeof meta>;

const phone = { viewport: { value: 'phone390', isRotated: false } } as const;

/** @summary A review was asked for: who asked, the role, device characters ticked, Share or Decline. */
export const Requested: Story = {};
/** @summary Phone: the request in one column. */
export const RequestedPhone: Story = { globals: phone };

/** @summary Device logins that do not cover the report: each row needs its own login first. */
export const NeedsLogin: Story = {
  parameters: {
    shell: {
      path: '/vetting',
      routes,
      scopes: ['esi-wallet.read_character_wallet.v1'],
      seed: seedVettingCorporation,
    },
  },
};

/** @summary Nobody asked: the empty state. */
export const NoRequest: Story = { parameters: { vetting: {} } };

/** @summary Shared: the same status page an applicant sees, in the shell, with no offer to open the app. */
export const Shared: Story = { parameters: { vetting: { request: 'shared' } } };
/** @summary Phone: the status page in the shell. */
export const SharedPhone: Story = { ...Shared, globals: phone };
