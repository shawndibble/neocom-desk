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

/**
 * Vetting: keep and browse all the raw data a review read (issue #6341). The report gets a
 * "Data we read" section; each source opens in a browsable view (sort, filter, search, date
 * range) with a character switcher; a flagged row links back to its flag; the member-facing
 * consent wording says the rows are kept after Send. Decisions: docs/design/mockups/vetting-raw-data/README.md.
 *
 * New components in this mockup: `DataWeRead` (the report's section, one row per source),
 * `FlagDataLinks` (a flag's way into its rows; in the build it sits in each flag's disclosure),
 * `RawDataBrowser` (source tabs, character switcher, filter row and a windowed table: composed
 * of Tabs, SegmentedControl, FilterBar and DataTable, so the new part is the arrangement),
 * `ConsentTermsKept` (the consent terms with a Kept after you press Send group),
 * `NewFlagLink` (the browser's Flag column: severity glyph and flag title linking to the flag).
 * The decision rail and the flag list are the real components.
 */
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

// ------------------------------------------------------------------- Report

/** @summary Today: the real flagged report. Flags keep 10 rows each; nothing else read is shown. */
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
/** @summary Phone: today's report. */
export const ReportTodayPhone: Story = { ...ReportToday, ...PHONE };

/** @summary Proposed report: flags, a link from each flag to its rows, and Data we read (one row per source: rows read). New components: DataWeRead, FlagDataLinks. */
export const Report: Story = { render: () => <ProposedReport /> };
/** @summary Phone: the report in one column, Data we read as a table that scrolls sideways. */
export const ReportPhone: Story = { ...Report, ...PHONE };

// ------------------------------------------------------------------ Sources

/** @summary Wallet journal, all 3 characters, 4,648 rows in one windowed list (no cap, scroll for the rest), newest first; Type, date range, search, sort. New component: RawDataBrowser. */
export const WalletLarge: Story = { render: () => <DataBrowserPage source="wallet" /> };
/** @summary Phone: the wallet journal; the table keeps its columns and scrolls sideways, filters in a sheet. */
export const WalletLargePhone: Story = { ...WalletLarge, ...PHONE };

/** @summary A flagged row: sorted by amount, the three donations from Corvin Hale lead; each carries a Flag link back to Watchlist ISK in the report and a tinted row. */
export const WalletFlaggedRow: Story = {
  render: () => (
    <DataBrowserPage
      source="wallet"
      initial={{ type: 'Donation' }}
      sort={{ columnId: 'amount', direction: 'desc' }}
    />
  ),
};
/** @summary Phone: flagged rows in the wallet journal. */
export const WalletFlaggedRowPhone: Story = { ...WalletFlaggedRow, ...PHONE };

/** @summary Wallet filtered to Flagged rows only, with the active-filter pills: the report's flag link opens this view. */
export const WalletFlaggedOnly: Story = {
  render: () => <DataBrowserPage source="wallet" initial={{ flagged: true }} />,
};

/** @summary Contacts: contact, kind, standing (worst first), Standing filter (Hostile, Neutral, Friendly), no date range because contacts have no dates. */
export const Contacts: Story = { render: () => <DataBrowserPage source="contact" /> };

/** @summary Mail headers: sent time, direction, sender or recipient and every recipient; no subject and no text column. */
export const MailHeaders: Story = { render: () => <DataBrowserPage source="mail" /> };
/** @summary Phone: mail headers. */
export const MailHeadersPhone: Story = { ...MailHeaders, ...PHONE };

/** @summary Contracts: filtered to Courier, search and a date range set, so the pills show what narrowed the list. */
export const ContractsFiltered: Story = {
  render: () => (
    <DataBrowserPage
      source="contract"
      initial={{ type: 'Courier', from: '2026-11-01', to: '2026-11-14' }}
    />
  ),
};

/** @summary Skills: skill, group, level; the Cynosural Field Theory V row links to its flag (Cyno skill, no capital). Skill group filter, no date range. */
export const Skills: Story = { render: () => <DataBrowserPage source="skills" /> };

/** @summary Corporation history: corporation, joined, left; public. Six corporations for Tamsin, 9 rows across the three characters. */
export const CorpHistory: Story = { render: () => <DataBrowserPage source="history" /> };

// --------------------------------------------------------------- Odd states

/** @summary An empty source: the read found nothing for Vell Hauling in Wallet journal in 30 days. Empty is a result, kept apart from No rows match. */
export const EmptySource: Story = {
  render: () => <DataBrowserPage source="wallet" characterId={2118000003} />,
};
/** @summary Phone: an empty source. */
export const EmptySourcePhone: Story = { ...EmptySource, ...PHONE };

/** @summary Filters that match nothing: No rows match, how many rows were read, Clear filters. */
export const NoMatch: Story = {
  render: () => <DataBrowserPage source="wallet" initial={{ query: 'zzzz' }} />,
};

// ------------------------------------------------------------------ Consent

/** @summary Today: the member's What you share terms. They never say the rows are kept after Send. */
export const ConsentToday: Story = {
  render: () => (
    <div className="mx-auto max-w-page space-y-4 px-4 py-4">
      <Panel title="What you share">
        <VettingConsentTerms readers="officers" />
      </Panel>
    </div>
  ),
};

/** @summary Proposed consent on /vetting: Every row listed, Kept after you press Send (30 and 90 days, or when you delete it), officers only, mail headers only, no key kept. New component: ConsentTermsKept. */
export const ConsentProposed: Story = { render: () => <ProposedMemberConsent /> };
/** @summary Phone: the proposed consent. */
export const ConsentProposedPhone: Story = { ...ConsentProposed, ...PHONE };

/** @summary The proposed terms alone (the same block also goes in the applicant's consent step). */
export const ConsentTermsOnly: Story = {
  render: () => (
    <div className="mx-auto max-w-page px-4 py-4">
      <ProposedConsentTerms />
    </div>
  ),
};
