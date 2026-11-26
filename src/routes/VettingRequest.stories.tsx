import type { Meta, StoryObj } from '@storybook/react-vite';
import { seedVettingCorporation, vettingShellRoutes } from '@/storybook/vettingShell';
import { withSampleVetting } from '@/storybook/withSampleVetting';
import { VETTING_SCOPES } from '@/auth/vettingScopes';
import { VettingRequest } from './VettingRequest';

const routes = vettingShellRoutes([]);

const meta = {
  title: 'pages/VettingRequest',
  component: VettingRequest,
  decorators: [withSampleVetting],
  parameters: {
    layout: 'fullscreen',
    vetting: { request: true },
    shell: { path: '/vetting', routes, scopes: VETTING_SCOPES, seed: seedVettingCorporation },
  },
} satisfies Meta<typeof VettingRequest>;

export default meta;
type Story = StoryObj<typeof meta>;

const phone = { viewport: { value: 'phone390', isRotated: false } } as const;

export const Requested: Story = {};
export const RequestedPhone: Story = { globals: phone };

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

export const NoRequest: Story = { parameters: { vetting: {} } };

export const Shared: Story = { parameters: { vetting: { request: 'shared' } } };
export const SharedPhone: Story = { ...Shared, globals: phone };
