import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState, type ReactNode } from 'react';
import { PageHeader, Tabs } from '@/components/ui';
import { BookProvider } from './BookContext';
import { BOOK_CONTEXT, MOON_ID, VARRO_ID } from './corpBookFixture';
import { MinerDetail } from './MinerDetail';
import { MinersTab } from './MinersTab';
import { MoonDetail } from './MoonDetail';
import { OverviewTab } from './OverviewTab';
import { MOONS_TABS } from './moonsPaths';
import { tabBarTabs } from '@/lib/pageTabs';
import { useTranslation } from 'react-i18next';

/**
 * The Corp Tax Book's section pages on a sample book the real engine built: the
 * Overview, the Miners list (a row opened in place) and the Miner and moon pages, each at
 * desktop and phone width. The components are the route's own.
 */
function Page({ children, tab }: { children: ReactNode; tab?: 'overview' | 'miners' }) {
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
      <OverviewTab showMoons />
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
