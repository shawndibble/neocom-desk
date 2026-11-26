import { useTranslation } from 'react-i18next';
import { PageHeader, TabPanel, Tabs, useTabsId } from '@/components/ui';
import { usePageTab } from '@/lib/usePageTab';
import { HELP_TABS } from '@/app/pageTabs';
import { FaqPanel } from '@/features/faq/FaqPanel';
import { HelpPanel } from '@/features/help/HelpPanel';
import { ShortcutsPanel } from '@/features/help/ShortcutsPanel';

export function Help() {
  const { t } = useTranslation();
  const [tab, setTab] = usePageTab(HELP_TABS);
  const tabsId = useTabsId();

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title={t('nav.help')} />
      <Tabs
        tabsId={tabsId}
        label={t('nav.help')}
        value={tab}
        onChange={(id) => setTab(id as typeof tab)}
        tabs={HELP_TABS.tabs.map((item) => ({ id: item.id, label: t(item.labelKey) }))}
      />
      <TabPanel tabsId={tabsId} tabId={tab}>
        {tab === 'shortcuts' && <ShortcutsPanel />}
        {tab === 'faq' && <FaqPanel />}
        {tab === 'support' && <HelpPanel />}
      </TabPanel>
    </div>
  );
}
