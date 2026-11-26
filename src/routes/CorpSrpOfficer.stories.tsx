import { useLayoutEffect, type ReactNode } from 'react';
import type { Decorator, Meta, StoryObj } from '@storybook/react-vite';
import { userEvent, within } from 'storybook/test';
import { db } from '@/db';
import { CORP_SCOPES_FOR_CAPABILITY } from '@/features/corp/corpScopes';
import {
  setSrpBackendOverride,
  setSrpOfficerBackendOverride,
} from '@/features/corp/srpBackendOverride';
import type { FixtureRoute } from '@/storybook/fixtureFetch';
import { SAMPLE_CHARACTERS } from '@/storybook/sampleData';
import { createSrpFixture, type SrpFixtureRole } from '@/storybook/srpFixture';
import { srpPublicInfoRoutes } from '@/storybook/srpMemberFixture';
import { createSrpOfficerFixture, type SrpOfficerScenario } from '@/storybook/srpOfficerFixture';
import { CorpSrp } from './CorpSrp';

const ROLES: Record<SrpFixtureRole, string[]> = {
  director: ['Director'],
  accountant: ['Accountant'],
  'ceo-not-owner': ['Director'],
};

let role: SrpFixtureRole = 'director';
const routes = (): FixtureRoute[] => [
  ...srpPublicInfoRoutes(
    (id) => SAMPLE_CHARACTERS.find((c) => c.characterId === id)?.corporationId ?? 1
  ),
  { path: /^\/characters\/\d+\/roles$/, respond: () => ({ body: { roles: ROLES[role] } }) },
];

const mailRoutes = (): FixtureRoute[] => [
  ...routes(),
  {
    path: /^\/corporations\/\d+\/$/,
    respond: () => ({ body: { name: 'Sample Corp', ceo_id: 1, member_count: 40, tax_rate: 0.1 } }),
  },
  { method: 'POST', path: /^\/characters\/\d+\/mail\/$/, respond: () => ({ body: 4711 }) },
];

async function seedCorp() {
  await Promise.all(
    SAMPLE_CHARACTERS.map((c) =>
      db.characters.update(c.characterId, { corporationId: c.corporationId })
    )
  );
}

const SCOPES = [...new Set(Object.values(CORP_SCOPES_FOR_CAPABILITY).flat())];
const MAIL_SCOPES = [...SCOPES, 'esi-mail.send_mail.v1'];

function SampleQueue({
  children,
  mode,
  scenario,
}: {
  children: ReactNode;
  mode: SrpFixtureRole;
  scenario: SrpOfficerScenario;
}) {
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
    await body.findAllByRole('checkbox');
    const control =
      body.queryByRole('tab', { name }) ?? (await body.findByRole('button', { name }));
    await userEvent.click(control);
  };

const openClaim =
  (pilot: string) =>
  async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const body = within(canvasElement);
    await userEvent.click((await body.findAllByText(pilot))[0]!);
  };

export const Queue: Story = { decorators: [withQueue('director', 'queue')] };

export const QueuePhone: Story = { ...Queue, globals: phone };

export const Selected: Story = {
  ...Queue,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement);
    const boxes = await body.findAllByRole('checkbox');
    await userEvent.click(boxes[0]!);
    await userEvent.click(boxes[1]!);
  },
};

export const SelectedPhone: Story = { ...Selected, globals: phone };

export const Owed: Story = { ...Queue, play: openTab(/owed/i) };

export const OwedPhone: Story = { ...Owed, globals: phone };

export const History: Story = { ...Queue, play: openTab(/history/i) };

export const HistoryPhone: Story = { ...History, globals: phone };

export const Empty: Story = { decorators: [withQueue('director', 'empty')] };

export const EmptyPhone: Story = { ...Empty, globals: phone };

export const DetailPending: Story = { ...Queue, play: openClaim('Varro Kestane') };

export const DetailOnDoctrine: Story = { ...Queue, play: openClaim('Lysa Kestane') };

export const DetailOnDoctrinePhone: Story = { ...DetailOnDoctrine, globals: phone };

export const DetailPendingPhone: Story = { ...DetailPending, globals: phone };

export const DetailOverridden: Story = {
  ...Queue,
  play: async (ctx) => {
    await openTab(/owed/i)(ctx);
    await openClaim('Joss Ferrin')(ctx);
  },
};

export const DetailOverriddenPhone: Story = { ...DetailOverridden, globals: phone };

export const RejectDialog: Story = {
  ...Queue,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement);
    await userEvent.click((await body.findAllByRole('button', { name: /reject/i }))[0]!);
  },
};

export const RejectDialogPhone: Story = { ...RejectDialog, globals: phone };

export const ChangeAmountDialog: Story = {
  ...Queue,
  play: async (ctx) => {
    await openClaim('Varro Kestane')(ctx);
    const body = within(ctx.canvasElement.ownerDocument.body);
    await userEvent.click(await body.findByRole('button', { name: /change amount/i }));
  },
};

export const ChangeAmountDialogPhone: Story = { ...ChangeAmountDialog, globals: phone };

export const AccountantQueue: Story = { decorators: [withQueue('accountant', 'queue')] };

const approveFirst = async ({ canvasElement }: { canvasElement: HTMLElement }) => {
  const body = within(canvasElement);
  await userEvent.click((await body.findAllByRole('button', { name: 'Approve' }))[0]!);
};

const approveTwo = async ({ canvasElement }: { canvasElement: HTMLElement }) => {
  const body = within(canvasElement);
  const boxes = await body.findAllByRole('checkbox');
  await userEvent.click(boxes[0]!);
  await userEvent.click(boxes[1]!);
  await userEvent.click(await body.findByRole('button', { name: /^approve \(2\)/i }));
};

export const ApprovedMailed: Story = {
  ...Queue,
  parameters: {
    ...meta.parameters,
    shell: { ...meta.parameters.shell, routes: mailRoutes, scopes: MAIL_SCOPES },
  },
  play: approveFirst,
};

export const ApprovedMailedPhone: Story = { ...ApprovedMailed, globals: phone };

export const BulkApprovedMailed: Story = { ...ApprovedMailed, play: approveTwo };

export const ApprovedNoMailPermission: Story = { ...Queue, play: approveFirst };

export const ApprovedNoMailPermissionPhone: Story = { ...ApprovedNoMailPermission, globals: phone };
