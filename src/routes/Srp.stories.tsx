import { useLayoutEffect, type ReactNode } from 'react';
import type { Decorator, Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { db } from '@/db';
import { setSrpMemberBackendOverride } from '@/features/corp/srp/srpMemberBackend';
import { SAMPLE_CHARACTERS } from '@/storybook/sampleData';
import {
  createSrpMemberFixture,
  SRP_FIXTURE_CORPORATION_ID,
  srpPublicInfoRoutes,
  type SrpFixtureOptions,
} from '@/storybook/srpMemberFixture';
import type { FixtureRoute } from '@/storybook/fixtureFetch';
import { Srp } from './Srp';

const routes = (): FixtureRoute[] => [
  ...srpPublicInfoRoutes(),
  { path: /^\/characters\/\d+\/roles$/, respond: () => ({ body: { roles: [] } }) },
];

const seedCorporation = async () => {
  await Promise.all(
    SAMPLE_CHARACTERS.map((c) =>
      db.characters.update(c.characterId, { corporationId: SRP_FIXTURE_CORPORATION_ID })
    )
  );
};

function SampleSrp({ children, member }: { children: ReactNode; member: SrpFixtureOptions }) {
  useLayoutEffect(() => {
    setSrpMemberBackendOverride(createSrpMemberFixture(Date.now(), member));
    return () => setSrpMemberBackendOverride(null);
  }, [member]);
  return children;
}

const withSampleSrp: Decorator = (Story, context) => (
  <SampleSrp member={context.parameters.srp ?? {}}>
    <Story />
  </SampleSrp>
);

const NO_KILLMAILS = ['esi-wallet.read_character_wallet.v1'] as const;
const WITH_KILLMAILS = [
  'esi-wallet.read_character_wallet.v1',
  'esi-killmails.read_killmails.v1',
] as const;

const meta = {
  title: 'pages/Srp',
  component: Srp,
  decorators: [withSampleSrp],
  parameters: {
    layout: 'fullscreen',
    srp: {},
    shell: { path: '/srp', routes, scopes: NO_KILLMAILS, seed: seedCorporation },
  },
} satisfies Meta<typeof Srp>;

export default meta;
type Story = StoryObj<typeof meta>;

const phone = { viewport: { value: 'phone390', isRotated: false } } as const;
const granted = {
  shell: { path: '/srp', routes, scopes: WITH_KILLMAILS, seed: seedCorporation },
};

export const Default: Story = {};
export const DefaultPhone: Story = { globals: phone };

export const LostShips: Story = { parameters: granted };
export const LostShipsPhone: Story = { parameters: granted, globals: phone };

export const NotCovered: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      await canvas.findByLabelText('Killmail link'),
      'https://zkillboard.com/kill/123/notcovered'
    );
    await userEvent.click(canvas.getByRole('button', { name: 'File claim' }));
    await expect(await canvas.findByRole('alert')).toHaveTextContent('not covered');
  },
};
export const NotCoveredPhone: Story = { ...NotCovered, globals: phone };

export const NotYourLoss: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      await canvas.findByLabelText('Killmail link'),
      'https://zkillboard.com/kill/123/mine'
    );
    await userEvent.click(canvas.getByRole('button', { name: 'File claim' }));
    await canvas.findByText('Paste a killmail where you were the victim.');
  },
};
export const NotYourLossPhone: Story = { ...NotYourLoss, globals: phone };

export const FleetRequired: Story = {
  parameters: { ...granted, srp: { requireFleetOrFc: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: /File claim for Hurricane/ }));
    await canvas.findByText('Fleet or FC is required by your corp.');
  },
};
export const FleetRequiredPhone: Story = { ...FleetRequired, globals: phone };

export const NoClaims: Story = { parameters: { srp: { noClaims: true } } };
export const NoClaimsPhone: Story = { ...NoClaims, globals: phone };

export const NotSetUp: Story = { parameters: { srp: { enabled: false } } };
export const NotSetUpPhone: Story = { ...NotSetUp, globals: phone };

export const Refile: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: /Re-file claim for Ferox/ }));
  },
};
export const RefilePhone: Story = { ...Refile, globals: phone };

export const ClaimDetail: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByText('Gila'));
  },
};
export const ClaimDetailPhone: Story = { ...ClaimDetail, globals: phone };

const pasteLink =
  (link: string) =>
  async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(await canvas.findByLabelText('Killmail link'), link);
  };

export const OffDoctrine: Story = {
  parameters: { srp: { doctrine: true } },
  play: async (ctx) => {
    await pasteLink('https://zkillboard.com/kill/123/hurricane')(ctx);
    await within(ctx.canvasElement).findByText('Off doctrine');
  },
};
export const OffDoctrinePhone: Story = { ...OffDoctrine, globals: phone };

export const OnDoctrine: Story = {
  parameters: { srp: { doctrine: true } },
  play: async (ctx) => {
    await pasteLink('https://zkillboard.com/kill/123/ondoctrine')(ctx);
    await within(ctx.canvasElement).findByText('Matches Hurricane - artillery');
  },
};

export const DoctrineNotChecked: Story = {
  parameters: { srp: { doctrine: true } },
  play: pasteLink('https://zkillboard.com/kill/8003/unchecked'),
};

export const DoctrineFromLostShip: Story = {
  parameters: { ...granted, srp: { doctrine: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: /File claim for Hurricane/ }));
    await canvas.findByText('Off doctrine');
  },
};
export const DoctrineFromLostShipPhone: Story = { ...DoctrineFromLostShip, globals: phone };
