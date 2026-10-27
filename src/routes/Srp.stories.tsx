import { useLayoutEffect, type ReactNode } from 'react';
import type { Decorator, Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { db } from '@/db';
import { setSrpMemberBackendOverride } from '@/features/corp/srp/srpMemberBackend';
import { SAMPLE_CHARACTERS } from '@/storybook/sampleData';
import {
  createSrpMemberFixture,
  SRP_FIXTURE_CORPORATION_ID,
  type SrpFixtureOptions,
} from '@/storybook/srpMemberFixture';
import type { FixtureRoute } from '@/storybook/fixtureFetch';
import { Srp } from './Srp';

/** The Overview header reads the pilot's public sheet and corporation (portrait, name, corp). */
const routes = (): FixtureRoute[] => [
  {
    path: /^\/corporations\/\d+\/?$/,
    respond: () => ({
      body: { name: 'Sample Corp', ceo_id: 1, member_count: 40, tax_rate: 0.1 },
    }),
  },
  {
    path: /^\/characters\/\d+$/,
    respond: ({ url }) => ({
      body: {
        name:
          SAMPLE_CHARACTERS.find((c) => url.pathname.endsWith(`/${c.characterId}`))?.name ??
          'Pilot',
        corporation_id: SRP_FIXTURE_CORPORATION_ID,
        birthday: '2016-03-01T00:00:00Z',
        bloodline_id: 1,
        gender: 'male',
        race_id: 1,
      },
    }),
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

/** The member stand-in, in place before the page's own load effects run (a layout effect), fresh per story. It also feeds the nav probe, so the Overview sub-nav lists SRP only where `enabled` is not false. */
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

/** @summary The player view, inside the Overview sub-nav, before the killmail grant: paste a link, a Grant prompt where the lost ships would be, My claims in every state. */
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

/** @summary The corporation has not turned SRP on: a direct visit explains it, and the sub-nav has no SRP tab. */
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

const pasteLink =
  (link: string) =>
  async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(await canvas.findByLabelText('Killmail link'), link);
  };

/** @summary A pasted Hurricane link the corp checks, off doctrine: the diff against the nearest Doctrine Fit, and the pilot can still file. */
export const OffDoctrine: Story = {
  parameters: { srp: { doctrine: true } },
  play: async (ctx) => {
    await pasteLink('https://zkillboard.com/kill/123/hurricane')(ctx);
    await within(ctx.canvasElement).findByText('Off doctrine');
  },
};
/** @summary The Off doctrine check, phone. */
export const OffDoctrinePhone: Story = { ...OffDoctrine, globals: phone };

/** @summary A pasted Hurricane link that matches a Doctrine Fit: "Matches <fit>". */
export const OnDoctrine: Story = {
  parameters: { srp: { doctrine: true } },
  play: async (ctx) => {
    await pasteLink('https://zkillboard.com/kill/123/ondoctrine')(ctx);
    await within(ctx.canvasElement).findByText('Matches Hurricane - artillery');
  },
};

/** @summary A pasted link for a hull the corp does not check: no doctrine line at all. */
export const DoctrineNotChecked: Story = {
  parameters: { srp: { doctrine: true } },
  play: pasteLink('https://zkillboard.com/kill/8003/unchecked'),
};

/** @summary One-tap File on a checked hull (Hurricane) opens the form with the check shown, so the pilot sees it before filing. */
export const DoctrineFromLostShip: Story = {
  parameters: { ...granted, srp: { doctrine: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: /File claim for Hurricane/ }));
    await canvas.findByText('Off doctrine');
  },
};
/** @summary The same from the lost-ship cards, phone. */
export const DoctrineFromLostShipPhone: Story = { ...DoctrineFromLostShip, globals: phone };
