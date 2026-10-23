import { useLayoutEffect, type ReactNode } from 'react';
import type { Decorator, Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { db } from '@/db';
import { CORP_SCOPES_FOR_CAPABILITY } from '@/features/corp/corpScopes';
import { setSrpBackendOverride } from '@/features/corp/srpBackendOverride';
import { setSrpMemberBackendOverride } from '@/features/corp/srp/srpMemberBackend';
import type { FixtureRoute } from '@/storybook/fixtureFetch';
import { SAMPLE_CHARACTERS } from '@/storybook/sampleData';
import { createSrpFixture, type SrpFixtureRole } from '@/storybook/srpFixture';
import {
  createSrpMemberFixture,
  SRP_FIXTURE_CORPORATION_ID,
  type SrpFixtureOptions,
} from '@/storybook/srpMemberFixture';
import { CorpSrp } from './CorpSrp';

/** Ship group names ESI answers on `/universe/groups/{id}`; any other group reads "Ship group <id>". */
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

/** Seeds the sample Characters into one SRP-fixture corporation, so the page has a corporation to read. */
const seedCorporation = async () => {
  await Promise.all(
    SAMPLE_CHARACTERS.map((c) =>
      db.characters.update(c.characterId, { corporationId: SRP_FIXTURE_CORPORATION_ID })
    )
  );
};

/** Every corp scope, so a Director is `ready` rather than asked to grant more. */
const SCOPES = [...new Set(Object.values(CORP_SCOPES_FOR_CAPABILITY).flat())];

interface SettingsStart {
  role: SrpFixtureRole;
  start: 'never-on' | 'configured';
}

/**
 * Both SRP stand-ins, in place before the page's own load effects run (a layout effect), fresh per
 * story so a change never leaks into the next. The member backend answers every story (it also
 * feeds the nav probe); the settings backend only the officer stories (`parameters.srpSettings`).
 */
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
    return () => {
      setSrpMemberBackendOverride(null);
      setSrpBackendOverride(null);
    };
  }, [member, settings]);
  return children;
}

const withSampleSrp: Decorator = (Story, context) => (
  <SampleSrp member={context.parameters.srp ?? {}} settings={context.parameters.srpSettings}>
    <Story />
  </SampleSrp>
);

const NO_KILLMAILS = ['esi-wallet.read_character_wallet.v1'] as const;
const WITH_KILLMAILS = [
  'esi-wallet.read_character_wallet.v1',
  'esi-killmails.read_killmails.v1',
] as const;

/** An officer story: the Settings tab, with every corp scope so the Director is `ready`. */
const settingsParams = (mode: SrpFixtureRole, start: SettingsStart['start']) => ({
  srpSettings: { role: mode, start },
  shell: { path: '/corp/srp/settings', routes, scopes: SCOPES, seed: seedCorporation },
});

const meta = {
  title: 'pages/CorpSrp',
  component: CorpSrp,
  decorators: [withSampleSrp],
  parameters: {
    layout: 'fullscreen',
    srp: {},
    shell: { path: '/corp/srp/claims', scopes: NO_KILLMAILS, seed: seedCorporation },
  },
} satisfies Meta<typeof CorpSrp>;

export default meta;
type Story = StoryObj<typeof meta>;

const phone = { viewport: { value: 'phone390', isRotated: false } } as const;
const granted = {
  shell: { path: '/corp/srp/claims', scopes: WITH_KILLMAILS, seed: seedCorporation },
};

// Member view (any pilot of an SRP corporation, no Corp Access).

/** @summary The member view before the killmail grant: paste a link, a Grant prompt where the lost ships would be, My claims in every state. */
export const Default: Story = {};
/** @summary The member view before the killmail grant, phone. */
export const DefaultPhone: Story = { globals: phone };

/** @summary After the killmail grant: one-tap File, Claimed, Too old past the corp's window and Not covered rows. */
export const LostShips: Story = { parameters: granted };
/** @summary Lost ships first as dense cards, phone; paste folded under them. */
export const LostShipsPhone: Story = { parameters: granted, globals: phone };

/** @summary A pasted link whose hull the corp does not cover: the Not covered note. */
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
/** @summary The Not covered note, phone. */
export const NotCoveredPhone: Story = { ...NotCovered, globals: phone };

/** @summary A pasted link that is not the pilot's own loss: an inline error under the field. */
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
/** @summary A refused link, phone. */
export const NotYourLossPhone: Story = { ...NotYourLoss, globals: phone };

/** @summary The corp requires a Fleet or FC: File on a lost ship fills the form in and asks for it. */
export const FleetRequired: Story = {
  parameters: { ...granted, srp: { requireFleetOrFc: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: /File claim for Hurricane/ }));
    await canvas.findByText('Fleet or FC is required by your corp.');
  },
};
/** @summary Fleet or FC required, phone: the paste form opens with the field focused. */
export const FleetRequiredPhone: Story = { ...FleetRequired, globals: phone };

/** @summary No claims yet. */
export const NoClaims: Story = { parameters: { srp: { noClaims: true } } };
/** @summary No claims yet, phone. */
export const NoClaimsPhone: Story = { ...NoClaims, globals: phone };

/** @summary The corporation has not turned SRP on: a direct visit explains it, and there is no nav item. */
export const NotSetUp: Story = { parameters: { srp: { enabled: false } } };
/** @summary SRP not set up, phone. */
export const NotSetUpPhone: Story = { ...NotSetUp, globals: phone };

/** @summary Re-file a Rejected claim once, with a note. */
export const Refile: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: /Re-file claim for Ferox/ }));
  },
};
/** @summary The re-file bottom sheet, phone. */
export const RefilePhone: Story = { ...Refile, globals: phone };

/** @summary A claim tapped open: state, exact amount, full reason, timeline and killmail link. */
export const ClaimDetail: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByText('Gila'));
  },
};
/** @summary The claim detail sheet, phone. */
export const ClaimDetailPhone: Story = { ...ClaimDetail, globals: phone };

// Officer views (Director or Accountant with Corp Access): Settings, beside the member tab.
/** @summary SRP never turned on: one "Turn on SRP" action. */
export const FirstTime: Story = { parameters: settingsParams('director', 'never-on') };

/** @summary The first-time state in the phone shell. */
export const FirstTimePhone: Story = { ...FirstTime, globals: phone };

/** @summary A Director's settings: percents, Hull Rules by class, claim window, Fleet or FC. */
export const Configured: Story = { parameters: settingsParams('director', 'configured') };

/** @summary The same settings in the phone shell: classes collapsed, one line per rule. */
export const ConfiguredPhone: Story = { ...Configured, globals: phone };

/** @summary Classes expanded and a hull searched: Cruiser and Battleship open, "mega" typed in the add-hull search. */
export const ExpandedWithSearch: Story = {
  ...Configured,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement);
    for (const name of [/Cruiser/, /Battleship/]) {
      await userEvent.click(await body.findByRole('button', { name }));
    }
    await userEvent.type(await body.findByRole('searchbox', { name: 'Add a hull' }), 'mega');
  },
};

/** @summary Invalid input: a percent over 100 and a window of 0 days, so the bar names the problems and Save is inert. */
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

/** @summary A CEO whose corp's SRP is owned by another Director: the Reclaim SRP row. */
export const CeoReclaim: Story = { parameters: settingsParams('ceo-not-owner', 'configured') };

/** @summary An Accountant opens SRP: the nav lists it, Settings says it is for Directors. */
export const AccountantView: Story = { parameters: settingsParams('accountant', 'configured') };
