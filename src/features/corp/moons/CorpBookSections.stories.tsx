import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState, type ReactNode } from 'react';
import { PageHeader, Tabs } from '@/components/ui';
import { BookProvider } from './BookContext';
import { BOOK_CONTEXT, BOOK_VIEW, MOON_ID, VARRO_ID } from './corpBookFixture';
import { ExtractionsTab } from './ExtractionsTab';
import { MinerDetail } from './MinerDetail';
import { MinersTab } from './MinersTab';
import { MoonDetail } from './MoonDetail';
import { OverviewTab } from './OverviewTab';
import { StatementPeriodDetail } from './StatementPeriodDetail';
import { StatementsTab } from './StatementsTab';
import { MOONS_TABS } from './moonsPaths';
import { tabBarTabs } from '@/lib/pageTabs';
import { useTranslation } from 'react-i18next';

/**
 * The Corp Tax Book's section pages on a sample book the real engine built: the
 * Overview, Extractions, Miners (a row opened in place) and Statements tabs, and the Miner,
 * moon and Statement period pages, each at desktop and phone width. The components are the
 * route's own.
 */
type SectionTab = 'overview' | 'extractions' | 'miners' | 'statements';
const ISSUED_PERIOD = BOOK_VIEW.input.statements[0]?.periodStart ?? '2026-08-01';

function Page({ children, tab }: { children: ReactNode; tab?: SectionTab }) {
  const { t } = useTranslation();
  const [value, setValue] = useState(tab);
  return (
    <BookProvider value={BOOK_CONTEXT}>
      <div className="mx-auto max-w-page space-y-4 px-4 py-4">
        {tab && (
          <>
            <PageHeader title={t('corp.moons.title')} />
            <Tabs
              tabsId="sections-story"
              label={t('corpTaxBook.moons.title')}
              value={value ?? tab}
              onChange={(id) => setValue(id as typeof tab)}
              tabs={tabBarTabs(MOONS_TABS).map((x) => ({ id: x.id, label: t(x.labelKey) }))}
            />
          </>
        )}
        {children}
      </div>
    </BookProvider>
  );
}

const meta = {
  title: 'corp/CorpBookSections',
  parameters: {
    layout: 'fullscreen',
    shell: { path: '/corp/moons', scopes: [] },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;
const phone = { globals: { viewport: { value: 'mobile1', isRotated: false } } };

/** Opens Varro's row, so the expanded state is on screen. */
const openFirstRow: Story['play'] = async ({ canvasElement }) => {
  await new Promise((r) => setTimeout(r, 400));
  const rows = [...canvasElement.querySelectorAll<HTMLElement>('tbody tr, [role="row"]')];
  rows.find((r) => r.textContent?.includes('Varro Kestane'))?.click();
};

/** @summary Overview: totals, Needs you, and the moons by Fractured, Ready and Pops in the next 7 days. */
export const Overview: Story = {
  render: () => (
    <Page tab="overview">
      <OverviewTab />
    </Page>
  ),
};
/** @summary Overview, phone. */
export const OverviewPhone: Story = { ...Overview, ...phone };

/** @summary Miners list: a row opens in place; the ⋮ holds three actions. */
export const Miners: Story = {
  render: () => (
    <Page tab="miners">
      <MinersTab />
    </Page>
  ),
};
/** @summary Miners list, phone. */
export const MinersPhone: Story = { ...Miners, ...phone };

/** @summary Miners list with a row open. */
export const MinersOpen: Story = { ...Miners, play: openFirstRow };
/** @summary Miners list with a row open, phone. */
export const MinersOpenPhone: Story = { ...MinersOpen, ...phone };

/** @summary Miner page: header facts, then one scroll of sections. */
export const MinerPage: Story = {
  render: () => (
    <Page>
      <MinerDetail id={VARRO_ID} />
    </Page>
  ),
};
/** @summary Miner page, phone. */
export const MinerPagePhone: Story = { ...MinerPage, ...phone };

/** @summary Moon page: header, then Miners (rows open to ore lines) and Past cycles. */
export const MoonPage: Story = {
  render: () => (
    <Page>
      <MoonDetail id={MOON_ID} />
    </Page>
  ),
};
/** @summary Moon page, phone. */
export const MoonPagePhone: Story = { ...MoonPage, ...phone };

/** @summary Extractions tab: the timeline of past, ready and extracting chunks. */
export const Extractions: Story = {
  render: () => (
    <Page tab="extractions">
      <ExtractionsTab />
    </Page>
  ),
};
/** @summary Extractions tab, phone. */
export const ExtractionsPhone: Story = { ...Extractions, ...phone };

/** @summary Statements tab: issued periods and the next run. */
export const Statements: Story = {
  render: () => (
    <Page tab="statements">
      <StatementsTab />
    </Page>
  ),
};
/** @summary Statements tab, phone. */
export const StatementsPhone: Story = { ...Statements, ...phone };

/** @summary Statement period page: one issued period's Statements and what each paid. */
export const StatementPeriodPage: Story = {
  render: () => (
    <Page>
      <StatementPeriodDetail periodStart={ISSUED_PERIOD} />
    </Page>
  ),
};
/** @summary Statement period page, phone. */
export const StatementPeriodPagePhone: Story = { ...StatementPeriodPage, ...phone };

/** @summary Miners list as the Overdue total's link opens it: `?balance=overdue`, a Balance pill. */
export const MinersOverdue: Story = {
  ...Miners,
  parameters: { shell: { path: '/corp/moons/miners?balance=overdue', scopes: [] } },
};
/** @summary Miners list filtered to overdue Miners, phone. */
export const MinersOverduePhone: Story = { ...MinersOverdue, ...phone };
