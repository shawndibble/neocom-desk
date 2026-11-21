import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState, type ReactNode } from 'react';
import { PageHeader, Tabs } from '@/components/ui';
import { BookProvider } from './BookContext';
import { BOOK_CONTEXT, BOOK_VIEW, MOON_ID, VARRO_ID } from './corpBookFixture';
import { ExtractionsTab } from './ExtractionsTab';
import { MinerDetail } from './MinerDetail';
import { MinersTab } from './MinersTab';
import { MoonDetail } from './MoonDetail';
import { RefineryPage } from './RefineryPage';
import { OverviewTab } from './OverviewTab';
import { LateNoticesTab } from './LateNoticesTab';
import { MOONS_TABS } from './moonsPaths';
import { tabBarTabs } from '@/lib/pageTabs';
import { useTranslation } from 'react-i18next';

/**
 * The Corp Tax Book's section pages on a sample book the real engine built: the
 * Overview, Extractions, Miners (a row opens the Miner's page) and Late notices tabs, and the
 * Miner and moon pages, each at desktop and phone width. The components are the
 * route's own.
 */
type SectionTab = 'overview' | 'extractions' | 'miners' | 'late-notices';

function Page({ children, tab }: { children: ReactNode; tab?: SectionTab }) {
  const { t } = useTranslation();
  const [value, setValue] = useState(tab);
  return (
    // openSettings stands in for the route's settings host, so Settings steps show their buttons.
    <BookProvider value={{ ...BOOK_CONTEXT, openSettings: () => {} }}>
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

/** @summary Miners list: a row opens that Miner's page; the ⋮ holds three actions. */
export const Miners: Story = {
  render: () => (
    <Page tab="miners">
      <MinersTab />
    </Page>
  ),
};
/** @summary Miners list, phone. */
export const MinersPhone: Story = { ...Miners, ...phone };

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

/** @summary A refinery's page (#6348): the rate in force, ore, Extractions and Miners. */
export const RefineryPageStory: Story = {
  render: () => (
    <Page>
      <RefineryPage
        structureId={BOOK_VIEW.extractions.find((x) => x.moonId === 3)?.structureId ?? 0}
      />
    </Page>
  ),
};
/** @summary A refinery's page, phone. */
export const RefineryPagePhone: Story = { ...RefineryPageStory, ...phone };

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

/** @summary Late notices tab: the next run and the notices sent. */
export const LateNotices: Story = {
  render: () => (
    <Page tab="late-notices">
      <LateNoticesTab />
    </Page>
  ),
};
/** @summary Late notices tab, phone. */
export const LateNoticesPhone: Story = { ...LateNotices, ...phone };

/** @summary Miners list as the Overdue total's link opens it: `?balance=overdue`, a Balance pill. */
export const MinersOverdue: Story = {
  ...Miners,
  parameters: { shell: { path: '/corp/moons/miners?balance=overdue', scopes: [] } },
};
/** @summary Miners list filtered to overdue Miners, phone. */
export const MinersOverduePhone: Story = { ...MinersOverdue, ...phone };
