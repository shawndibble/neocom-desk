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

type SectionTab = 'overview' | 'extractions' | 'miners' | 'late-notices';

function Page({ children, tab }: { children: ReactNode; tab?: SectionTab }) {
  const { t } = useTranslation();
  const [value, setValue] = useState(tab);
  return (
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

export const Overview: Story = {
  render: () => (
    <Page tab="overview">
      <OverviewTab />
    </Page>
  ),
};
export const OverviewPhone: Story = { ...Overview, ...phone };

export const Miners: Story = {
  render: () => (
    <Page tab="miners">
      <MinersTab />
    </Page>
  ),
};
export const MinersPhone: Story = { ...Miners, ...phone };

export const MinerPage: Story = {
  render: () => (
    <Page>
      <MinerDetail id={VARRO_ID} />
    </Page>
  ),
};
export const MinerPagePhone: Story = { ...MinerPage, ...phone };

export const MoonPage: Story = {
  render: () => (
    <Page>
      <MoonDetail id={MOON_ID} />
    </Page>
  ),
};
export const MoonPagePhone: Story = { ...MoonPage, ...phone };

export const RefineryPageStory: Story = {
  render: () => (
    <Page>
      <RefineryPage
        structureId={BOOK_VIEW.extractions.find((x) => x.moonId === 3)?.structureId ?? 0}
      />
    </Page>
  ),
};
export const RefineryPagePhone: Story = { ...RefineryPageStory, ...phone };

export const Extractions: Story = {
  render: () => (
    <Page tab="extractions">
      <ExtractionsTab />
    </Page>
  ),
};
export const ExtractionsPhone: Story = { ...Extractions, ...phone };

export const LateNotices: Story = {
  render: () => (
    <Page tab="late-notices">
      <LateNoticesTab />
    </Page>
  ),
};
export const LateNoticesPhone: Story = { ...LateNotices, ...phone };

export const MinersOverdue: Story = {
  ...Miners,
  parameters: { shell: { path: '/corp/moons/miners?balance=overdue', scopes: [] } },
};
export const MinersOverduePhone: Story = { ...MinersOverdue, ...phone };
