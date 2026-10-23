import { useLayoutEffect, type ReactNode } from 'react';
import type { Decorator, Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { db } from '@/db';
import { setSrpMemberBackendOverride } from '@/features/corp/srp/srpMemberBackend';
import {
  createSrpMemberFixture,
  SRP_FIXTURE_CORPORATION_ID,
  type SrpFixtureOptions,
} from '@/storybook/srpMemberFixture';
import { SAMPLE_CHARACTERS } from '@/storybook/sampleData';
import { CorpSrp } from './CorpSrp';

/** Sample SRP answers in place of the backend, fresh per story so a change never leaks into the next. */
function SampleSrp({ children, options }: { children: ReactNode; options: SrpFixtureOptions }) {
  // A layout effect, so the override is in place before the page's own load effects run.
  useLayoutEffect(() => {
    setSrpMemberBackendOverride(createSrpMemberFixture(Date.now(), options));
    return () => setSrpMemberBackendOverride(null);
  }, [options]);
  return children;
}

const withSampleSrp: Decorator = (Story, context) => (
  <SampleSrp options={context.parameters.srp ?? {}}>
    <Story />
  </SampleSrp>
);

/** The corp comes from public affiliation, which the sample account lacks: write it in. */
const seedCorporation = async () => {
  await Promise.all(
    SAMPLE_CHARACTERS.map((c) =>
      db.characters.update(c.characterId, { corporationId: SRP_FIXTURE_CORPORATION_ID })
    )
  );
};

const NO_KILLMAILS = ['esi-wallet.read_character_wallet.v1'] as const;
const WITH_KILLMAILS = [
  'esi-wallet.read_character_wallet.v1',
  'esi-killmails.read_killmails.v1',
] as const;

const meta = {
  title: 'pages/CorpSrp',
  component: CorpSrp,
  decorators: [withSampleSrp],
  parameters: {
    layout: 'fullscreen',
    srp: {},
    shell: { path: '/corp/srp', scopes: NO_KILLMAILS, seed: seedCorporation },
  },
} satisfies Meta<typeof CorpSrp>;

export default meta;
type Story = StoryObj<typeof meta>;

const phone = { viewport: { value: 'phone390', isRotated: false } } as const;
const granted = { shell: { path: '/corp/srp', scopes: WITH_KILLMAILS, seed: seedCorporation } };

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
