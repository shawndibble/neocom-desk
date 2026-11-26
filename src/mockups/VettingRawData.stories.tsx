import type { Meta, StoryObj } from '@storybook/react-vite';
import { CorpVetting } from '@/routes/CorpVetting';
import { VettingConsentTerms } from '@/features/corp/vetting/VettingConsentTerms';
import { Panel } from '@/components/ui';
import {
  seedVettingCorporation,
  VETTING_SHELL_SCOPES,
  vettingShellRoutes,
} from '@/storybook/vettingShell';
import { VETTING_FIXTURE_REVIEWS } from '@/storybook/vettingFixture';
import { withSampleVetting } from '@/storybook/withSampleVetting';
import { DataBrowserPage } from './vettingRawDataBrowser';
import { ProposedConsentTerms, ProposedMemberConsent, ProposedReport } from './vettingRawDataParts';

const meta = {
  title: 'mockups/VettingRawData',
  tags: ['!manifest'],
  decorators: [withSampleVetting],
  parameters: {
    layout: 'fullscreen',
    vetting: {},
    shell: {
      path: '/corp/vetting/open',
      routes: vettingShellRoutes(['Director']),
      scopes: VETTING_SHELL_SCOPES,
      seed: seedVettingCorporation,
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const PHONE = { globals: { viewport: { value: 'mobile1', isRotated: false } } } as const;

export const ReportToday: Story = {
  render: () => <CorpVetting />,
  parameters: {
    shell: {
      path: `/corp/vetting/open/${VETTING_FIXTURE_REVIEWS.flagged}`,
      routes: vettingShellRoutes(['Director']),
      scopes: VETTING_SHELL_SCOPES,
      seed: seedVettingCorporation,
    },
  },
};
export const ReportTodayPhone: Story = { ...ReportToday, ...PHONE };

export const Report: Story = { render: () => <ProposedReport /> };
export const ReportPhone: Story = { ...Report, ...PHONE };

export const WalletLarge: Story = { render: () => <DataBrowserPage source="wallet" /> };
export const WalletLargePhone: Story = { ...WalletLarge, ...PHONE };

export const WalletFlaggedRow: Story = {
  render: () => (
    <DataBrowserPage
      source="wallet"
      initial={{ type: 'Donation' }}
      sort={{ columnId: 'amount', direction: 'desc' }}
    />
  ),
};
export const WalletFlaggedRowPhone: Story = { ...WalletFlaggedRow, ...PHONE };

export const WalletFlaggedOnly: Story = {
  render: () => <DataBrowserPage source="wallet" initial={{ flagged: true }} />,
};

export const Contacts: Story = { render: () => <DataBrowserPage source="contact" /> };

export const MailHeaders: Story = { render: () => <DataBrowserPage source="mail" /> };
export const MailHeadersPhone: Story = { ...MailHeaders, ...PHONE };

export const ContractsFiltered: Story = {
  render: () => (
    <DataBrowserPage
      source="contract"
      initial={{ type: 'Courier', from: '2026-11-01', to: '2026-11-14' }}
    />
  ),
};

export const Skills: Story = { render: () => <DataBrowserPage source="skills" /> };

export const CorpHistory: Story = { render: () => <DataBrowserPage source="history" /> };

export const EmptySource: Story = {
  render: () => <DataBrowserPage source="wallet" characterId={2118000003} />,
};
export const EmptySourcePhone: Story = { ...EmptySource, ...PHONE };

export const NoMatch: Story = {
  render: () => <DataBrowserPage source="wallet" initial={{ query: 'zzzz' }} />,
};

export const ConsentToday: Story = {
  render: () => (
    <div className="mx-auto max-w-page space-y-4 px-4 py-4">
      <Panel title="What you share">
        <VettingConsentTerms readers="officers" />
      </Panel>
    </div>
  ),
};

export const ConsentProposed: Story = { render: () => <ProposedMemberConsent /> };
export const ConsentProposedPhone: Story = { ...ConsentProposed, ...PHONE };

export const ConsentTermsOnly: Story = {
  render: () => (
    <div className="mx-auto max-w-page px-4 py-4">
      <ProposedConsentTerms />
    </div>
  ),
};
