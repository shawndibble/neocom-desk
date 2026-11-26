import { useLayoutEffect, type ReactNode } from 'react';
import type { Decorator, Meta, StoryObj } from '@storybook/react-vite';
import { userEvent, within } from 'storybook/test';
import { db } from '@/db';
import { CORP_SCOPES_FOR_CAPABILITY } from '@/features/corp/corpScopes';
import {
  setSrpBackendOverride,
  setSrpDoctrineBackendOverride,
} from '@/features/corp/srpBackendOverride';
import { setSrpMemberBackendOverride } from '@/features/corp/srp/srpMemberBackend';
import type { FixtureRoute } from '@/storybook/fixtureFetch';
import { SAMPLE_CHARACTERS } from '@/storybook/sampleData';
import {
  createDoctrineFixture,
  createSrpFixture,
  type SrpFixtureRole,
} from '@/storybook/srpFixture';
import {
  createSrpMemberFixture,
  SRP_FIXTURE_CORPORATION_ID,
  srpPublicInfoRoutes,
  type SrpFixtureOptions,
} from '@/storybook/srpMemberFixture';
import { CorpSrp } from './CorpSrp';

const SHIP_GROUPS: Record<number, string> = {
  25: 'Frigate',
  26: 'Cruiser',
  27: 'Battleship',
  28: 'Industrial',
  29: 'Capsule',
  30: 'Titan',
  31: 'Shuttle',
  237: 'Rookie ship',
  324: 'Assault Frigate',
  358: 'Heavy Assault Cruiser',
  380: 'Deep Space Transport',
  419: 'Combat Battlecruiser',
  420: 'Destroyer',
  463: 'Mining Barge',
  485: 'Dreadnought',
  513: 'Freighter',
  540: 'Command Ship',
  541: 'Interdictor',
  543: 'Exhumer',
  547: 'Carrier',
  659: 'Supercarrier',
  830: 'Covert Ops',
  831: 'Interceptor',
  832: 'Logistics',
  833: 'Force Recon Ship',
  834: 'Stealth Bomber',
  883: 'Capital Industrial Ship',
  893: 'Electronic Attack Ship',
  894: 'Heavy Interdiction Cruiser',
  898: 'Black Ops',
  900: 'Marauder',
  902: 'Jump Freighter',
  906: 'Combat Recon Ship',
  941: 'Industrial Command Ship',
  963: 'Strategic Cruiser',
  1022: 'Prototype Exploration Ship',
  1201: 'Attack Battlecruiser',
  1202: 'Blockade Runner',
  1283: 'Expedition Frigate',
  1305: 'Tactical Destroyer',
  1527: 'Logistics Frigate',
  1534: 'Command Destroyer',
  1538: 'Force Auxiliary',
  1972: 'Flag Cruiser',
  4594: 'Lancer Dreadnought',
  4902: 'Expedition Command Ship',
  5087: 'Precursor Frigate',
  5120: 'Precursor Cruiser',
};

const ROLES: Record<SrpFixtureRole, string[]> = {
  director: ['Director'],
  accountant: ['Accountant'],
  'ceo-not-owner': ['Director'],
};

let role: SrpFixtureRole = 'director';
const routes = (): FixtureRoute[] => [
  ...srpPublicInfoRoutes(),
  {
    path: /^\/characters\/\d+\/roles$/,
    respond: () => ({ body: { roles: ROLES[role] } }),
  },
  {
    path: /^\/universe\/groups\/\d+$/,
    respond: ({ url }) => {
      const id = Number(url.pathname.split('/').pop());
      return { body: { group_id: id, name: SHIP_GROUPS[id] ?? `Ship group ${id}` } };
    },
  },
];

const seedCorporation = async () => {
  await Promise.all(
    SAMPLE_CHARACTERS.map((c) =>
      db.characters.update(c.characterId, { corporationId: SRP_FIXTURE_CORPORATION_ID })
    )
  );
};

const SCOPES = [...new Set(Object.values(CORP_SCOPES_FOR_CAPABILITY).flat())];

interface SettingsStart {
  role: SrpFixtureRole;
  start: 'never-on' | 'configured';
  doctrines?: 'sample' | 'empty';
}

function SampleSrp({
  children,
  member,
  settings,
}: {
  children: ReactNode;
  member: SrpFixtureOptions;
  settings: SettingsStart | undefined;
}) {
  useLayoutEffect(() => {
    if (settings) role = settings.role;
    setSrpMemberBackendOverride(createSrpMemberFixture(Date.now(), member));
    setSrpBackendOverride(settings ? createSrpFixture(settings.role, settings.start) : null);
    setSrpDoctrineBackendOverride(
      settings ? createDoctrineFixture(settings.doctrines ?? 'sample') : null
    );
    return () => {
      setSrpMemberBackendOverride(null);
      setSrpBackendOverride(null);
      setSrpDoctrineBackendOverride(null);
    };
  }, [member, settings]);
  return children;
}

const withSampleSrp: Decorator = (Story, context) => (
  <SampleSrp member={context.parameters.srp ?? {}} settings={context.parameters.srpSettings}>
    <Story />
  </SampleSrp>
);

const settingsParams = (
  mode: SrpFixtureRole,
  start: SettingsStart['start'],
  doctrines?: SettingsStart['doctrines']
) => ({
  srpSettings: { role: mode, start, doctrines },
  shell: { path: '/corp/srp/settings', routes, scopes: SCOPES, seed: seedCorporation },
});

const meta = {
  title: 'pages/CorpSrp',
  component: CorpSrp,
  decorators: [withSampleSrp],
  parameters: {
    layout: 'fullscreen',
    srp: {},
    srpSettings: { role: 'director', start: 'configured' },
    shell: { path: '/corp/srp/settings', routes, scopes: SCOPES, seed: seedCorporation },
  },
} satisfies Meta<typeof CorpSrp>;

export default meta;
type Story = StoryObj<typeof meta>;

const phone = { viewport: { value: 'phone390', isRotated: false } } as const;

export const FirstTime: Story = { parameters: settingsParams('director', 'never-on') };

export const FirstTimePhone: Story = { ...FirstTime, globals: phone };

export const Configured: Story = { parameters: settingsParams('director', 'configured') };

export const ConfiguredPhone: Story = { ...Configured, globals: phone };

export const ExpandedWithSearch: Story = {
  ...Configured,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement);
    await userEvent.click(await body.findByRole('button', { name: /Cruiser/ }));
    await userEvent.type(
      await body.findByRole('searchbox', { name: 'Add a hull or class' }),
      'destroyer'
    );
    await userEvent.click(await body.findByRole('button', { name: 'Add Destroyer' }));
    await userEvent.type(
      await body.findByRole('searchbox', { name: 'Add a hull or class' }),
      'mega'
    );
  },
};

export const Validation: Story = {
  ...Configured,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement);
    const km = await body.findByLabelText('Killmail percent');
    await userEvent.clear(km);
    await userEvent.type(km, '150');
    const win = await body.findByLabelText('Claim window');
    await userEvent.clear(win);
    await userEvent.type(win, '0');
  },
};

export const DoctrineFits: Story = {
  ...Configured,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement);
    await userEvent.click(await body.findByRole('button', { name: /Combat Battlecruiser/ }));
    await body.findByRole('group', { name: 'Doctrine Fits for Hurricane' });
  },
};

export const DoctrineFitsPhone: Story = { ...DoctrineFits, globals: phone };

export const DoctrineFitsEmpty: Story = {
  parameters: settingsParams('director', 'configured', 'empty'),
};

export const PasteEftUnresolved: Story = {
  ...Configured,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement);
    await userEvent.click(await body.findByRole('button', { name: 'Paste EFT' }));
    const dialog = within(canvasElement.ownerDocument.body);
    await userEvent.click(await dialog.findByLabelText('EFT text'));
    await userEvent.paste(
      '[Hurricane, Test fit]\nDamage Control II\n720mm Howitzer Artillery II\nNot A Real Module\n\nMedium Trimark Armor Pump II'
    );
    await dialog.findByText('1 line not recognised');
  },
};

export const PasteEftUnresolvedPhone: Story = { ...PasteEftUnresolved, globals: phone };

export const DeleteDoctrineFit: Story = {
  ...Configured,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement);
    await userEvent.click(await body.findByRole('button', { name: 'Delete Cerberus - shield' }));
  },
};

export const CeoReclaim: Story = { parameters: settingsParams('ceo-not-owner', 'configured') };

export const AccountantView: Story = { parameters: settingsParams('accountant', 'configured') };
