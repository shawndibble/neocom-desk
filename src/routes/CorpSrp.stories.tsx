import { useLayoutEffect, type ReactNode } from 'react';
import type { Decorator, Meta, StoryObj } from '@storybook/react-vite';
import { userEvent, within } from 'storybook/test';
import { db } from '@/db';
import { CORP_SCOPES_FOR_CAPABILITY } from '@/features/corp/corpScopes';
import { setSrpBackendOverride } from '@/features/corp/srpBackendOverride';
import type { FixtureRoute } from '@/storybook/fixtureFetch';
import { SAMPLE_CHARACTERS } from '@/storybook/sampleData';
import { createSrpFixture, type SrpFixtureRole } from '@/storybook/srpFixture';
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

/** The sample corp's id on every sample Character, so the page has a corporation to read. */
async function seedCorp() {
  await Promise.all(
    SAMPLE_CHARACTERS.map((c) =>
      db.characters.update(c.characterId, { corporationId: c.corporationId })
    )
  );
}

/** Every corp scope, so a Director is `ready` rather than asked to grant more. */
const SCOPES = [...new Set(Object.values(CORP_SCOPES_FOR_CAPABILITY).flat())];

function SampleSrp({
  children,
  mode,
  start,
}: {
  children: ReactNode;
  mode: SrpFixtureRole;
  start: 'never-on' | 'configured';
}) {
  // A layout effect, so the stand-in is in place before the page's load effects run; fresh per story.
  useLayoutEffect(() => {
    role = mode;
    setSrpBackendOverride(createSrpFixture(mode, start));
    return () => setSrpBackendOverride(null);
  }, [mode, start]);
  return children;
}

const withSrp =
  (mode: SrpFixtureRole, start: 'never-on' | 'configured'): Decorator =>
  (Story) => (
    <SampleSrp mode={mode} start={start}>
      <Story />
    </SampleSrp>
  );

const meta = {
  title: 'pages/CorpSrp',
  component: CorpSrp,
  parameters: {
    layout: 'fullscreen',
    shell: { path: '/corp/srp', routes, scopes: SCOPES, seed: seedCorp },
  },
} satisfies Meta<typeof CorpSrp>;

export default meta;
type Story = StoryObj<typeof meta>;

const phone = { viewport: { value: 'mobile1', isRotated: false } } as const;

/** @summary SRP never turned on: one "Turn on SRP" action. */
export const FirstTime: Story = { decorators: [withSrp('director', 'never-on')] };

/** @summary The first-time state in the phone shell. */
export const FirstTimePhone: Story = { ...FirstTime, globals: phone };

/** @summary A Director's settings: percents, Hull Rules by class, claim window, Fleet or FC. */
export const Configured: Story = { decorators: [withSrp('director', 'configured')] };

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
export const CeoReclaim: Story = { decorators: [withSrp('ceo-not-owner', 'configured')] };

/** @summary An Accountant opens SRP: the nav lists it, Settings says it is for Directors. */
export const AccountantView: Story = { decorators: [withSrp('accountant', 'configured')] };
