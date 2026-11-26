import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button, PageHeader, Tabs } from '@/components/ui';
import { tabBarTabs } from '@/lib/pageTabs';
import { useTranslation } from 'react-i18next';
import { MOONS_TABS } from './moonsPaths';
import { MoonOwnersTable } from './MoonOwnersTable';
import { NAMES, NOW, ROWS, TOTALS } from './moonOwnerRowFixtures';

function MoonsPage() {
  const { t } = useTranslation();
  const tabs = tabBarTabs(MOONS_TABS);
  return (
    <div className="mx-auto max-w-page space-y-4">
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

const meta = {
  title: 'corp/MoonOwnersTab',
  component: MoonsPage,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof MoonsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
