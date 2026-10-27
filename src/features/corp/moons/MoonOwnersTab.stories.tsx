import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button, PageHeader, Tabs } from '@/components/ui';
import { tabBarTabs } from '@/lib/pageTabs';
import { useTranslation } from 'react-i18next';
import { MOONS_TABS } from './moonsPaths';
import { MoonOwnersTable } from './MoonOwnersTable';
import { NAMES, NOW, ROWS, TOTALS } from './moonOwnerRowFixtures';

/**
 * The page the Moon owners tab sits on: header with Invite a moon owner, the tab bar
 * and the table with its chips. Composed from the same parts as the route.
 */
function MoonsPage({ showExtractions }: { showExtractions: boolean }) {
  const { t } = useTranslation();
  const tabs = tabBarTabs(MOONS_TABS).filter((x) => showExtractions || x.id !== 'extractions');
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title={t('corp.moons.title')}
        meta={<span className="text-xs text-text-dim">Synced 2 hours ago by Kestrel Vane</span>}
        actions={<Button variant="ghost">{t('corpTaxBook.moons.moonOwners.invite')}</Button>}
      />
      <Tabs
        tabsId="moons-story"
        label={t('corpTaxBook.moons.title')}
        value="moon-owners"
        onChange={() => {}}
        tabs={tabs.map((x) => ({ id: x.id, label: t(x.labelKey) }))}
      />
      <MoonOwnersTable
        rows={ROWS}
        totals={TOTALS}
        name={(id) => NAMES[id] ?? `#${id}`}
        now={NOW}
        onOpen={() => {}}
        onPay={() => {}}
      />
    </div>
  );
}

/** @summary The Moons page on its Moon owners tab (List A): header chips, Invite a moon owner, the table. */
const meta = {
  title: 'corp/MoonOwnersTab',
  component: MoonsPage,
  parameters: { layout: 'padded' },
  args: { showExtractions: true },
} satisfies Meta<typeof MoonsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary An accounting corporation that also owns moons: four tabs. */
export const Default: Story = {};

/** @summary An accounting corporation with no moons of its own: no Extractions tab. */
export const NoMoons: Story = { args: { showExtractions: false } };
