import { useLayoutEffect, type ReactNode } from 'react';
import type { Decorator, Meta, StoryObj } from '@storybook/react-vite';
import { userEvent, within } from 'storybook/test';
import { db } from '@/db';
import { CORP_SCOPES_FOR_CAPABILITY } from '@/features/corp/corpScopes';
import { setSrpBackendOverride } from '@/features/corp/srpBackendOverride';
import { setSrpOfficerBackendOverride } from '@/features/corp/srpOfficerBackendOverride';
import type { FixtureRoute } from '@/storybook/fixtureFetch';
import { SAMPLE_CHARACTERS } from '@/storybook/sampleData';
import { createSrpFixture, type SrpFixtureRole } from '@/storybook/srpFixture';
import { createSrpOfficerFixture, type SrpOfficerScenario } from '@/storybook/srpOfficerFixture';
import { CorpSrp } from './CorpSrp';

const ROLES: Record<SrpFixtureRole, string[]> = {
  director: ['Director'],
  accountant: ['Accountant'],
  'ceo-not-owner': ['Director'],
};

let role: SrpFixtureRole = 'director';
const routes = (): FixtureRoute[] => [
  { path: /^\/characters\/\d+\/roles$/, respond: () => ({ body: { roles: ROLES[role] } }) },
];

async function seedCorp() {
  await Promise.all(
    SAMPLE_CHARACTERS.map((c) =>
      db.characters.update(c.characterId, { corporationId: c.corporationId })
    )
  );
}

const SCOPES = [...new Set(Object.values(CORP_SCOPES_FOR_CAPABILITY).flat())];

function SampleQueue({
  children,
  mode,
  scenario,
}: {
  children: ReactNode;
  mode: SrpFixtureRole;
  scenario: SrpOfficerScenario;
}) {
  // A layout effect, so the stand-ins are in place before the page's load effects run; fresh per story.
  useLayoutEffect(() => {
    role = mode;
    setSrpBackendOverride(createSrpFixture(mode, 'configured'));
    setSrpOfficerBackendOverride(createSrpOfficerFixture(scenario));
    return () => {
      setSrpBackendOverride(null);
      setSrpOfficerBackendOverride(null);
    };
  }, [mode, scenario]);
  return children;
}

const withQueue =
  (mode: SrpFixtureRole, scenario: SrpOfficerScenario): Decorator =>
  (Story) => (
    <SampleQueue mode={mode} scenario={scenario}>
      <Story />
    </SampleQueue>
  );

const meta = {
  title: 'pages/CorpSrpOfficer',
  component: CorpSrp,
  parameters: {
    layout: 'fullscreen',
    shell: { path: '/corp/srp/queue', routes, scopes: SCOPES, seed: seedCorp },
  },
} satisfies Meta<typeof CorpSrp>;

export default meta;
type Story = StoryObj<typeof meta>;

const phone = { viewport: { value: 'mobile1', isRotated: false } } as const;

const openTab =
  (name: RegExp) =>
  async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const body = within(canvasElement);
    // The tab bar is Tabs on a desktop and a SegmentedControl (radios) on a phone.
    await body.findAllByRole('checkbox');
    const control = body.queryByRole('tab', { name }) ?? (await body.findByRole('radio', { name }));
    await userEvent.click(control);
  };

const openClaim =
  (pilot: string) =>
  async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const body = within(canvasElement);
    await userEvent.click((await body.findAllByText(pilot))[0]!);
  };

/** @summary The officer queue: five pending claims, one with no worked-out amount, and the activity feed. */
export const Queue: Story = { decorators: [withQueue('director', 'queue')] };

/** @summary The queue in the phone shell: dense cards, Select all in the list, Approve and Reject… per card. */
export const QueuePhone: Story = { ...Queue, globals: phone };

/** @summary Two claims ticked: the bulk Approve (n) button. */
export const Selected: Story = {
  ...Queue,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement);
    const boxes = await body.findAllByRole('checkbox');
    await userEvent.click(boxes[0]!);
    await userEvent.click(boxes[1]!);
  },
};

/** @summary Two claims ticked on a phone: the bar pinned above the tab bar. */
export const SelectedPhone: Story = { ...Selected, globals: phone };

/** @summary Owed: approved claims waiting to be paid in game, with Copy amount and Mark paid. */
export const Owed: Story = { ...Queue, play: openTab(/owed/i) };

/** @summary Owed on a phone. */
export const OwedPhone: Story = { ...Owed, globals: phone };

/** @summary History: paid and rejected claims with their reasons. */
export const History: Story = { ...Queue, play: openTab(/history/i) };

/** @summary History on a phone. */
export const HistoryPhone: Story = { ...History, globals: phone };

/** @summary Nothing waiting. */
export const Empty: Story = { decorators: [withQueue('director', 'empty')] };

/** @summary Nothing waiting, phone shell. */
export const EmptyPhone: Story = { ...Empty, globals: phone };

/** @summary A pending claim's detail: facts, killmail link, audit trail, Reject… and Approve. */
export const DetailPending: Story = { ...Queue, play: openClaim('Varro Kestane') };

/** @summary The detail on a phone: Reject… and Approve pinned at the bottom. */
export const DetailPendingPhone: Story = { ...DetailPending, globals: phone };

/** @summary An approved claim whose amount an officer changed: computed figure, reason and audit trail. */
export const DetailOverridden: Story = {
  ...Queue,
  play: async (ctx) => {
    await openTab(/owed/i)(ctx);
    await openClaim('Joss Ferrin')(ctx);
  },
};

/** @summary The overridden detail on a phone. */
export const DetailOverriddenPhone: Story = { ...DetailOverridden, globals: phone };

/** @summary Reject dialog: the reason is required and goes to the pilot. */
export const RejectDialog: Story = {
  ...Queue,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement);
    await userEvent.click((await body.findAllByRole('button', { name: /reject/i }))[0]!);
  },
};

/** @summary Reject dialog in the phone shell: a bottom sheet. */
export const RejectDialogPhone: Story = { ...RejectDialog, globals: phone };

/** @summary Change amount, from the claim detail: the computed amount and basis stay visible. */
export const ChangeAmountDialog: Story = {
  ...Queue,
  play: async (ctx) => {
    await openClaim('Varro Kestane')(ctx);
    const body = within(ctx.canvasElement.ownerDocument.body);
    await userEvent.click(await body.findByRole('button', { name: /change amount/i }));
  },
};

/** @summary Change amount in the phone shell. */
export const ChangeAmountDialogPhone: Story = { ...ChangeAmountDialog, globals: phone };

/** @summary An Accountant opens SRP: the queue is theirs, Settings is not listed. */
export const AccountantQueue: Story = { decorators: [withQueue('accountant', 'queue')] };
