import { useTranslation } from 'react-i18next';
import { PageHeader, TabPanel, Tabs, useTabsId } from '@/components/ui';
import { usePageTab } from '@/lib/usePageTab';
import { HELP_TABS } from '@/app/pageTabs';
import { FaqPanel } from '@/features/faq/FaqPanel';
import { HelpPanel } from '@/features/help/HelpPanel';
import { ShortcutsPanel } from '@/features/help/ShortcutsPanel';

/**
 * Help & FAQ, a footer page of its own rather than two Settings sections
 * (scope decision `20261002-145653-lp-store-under-market-pilot-lookup-its-own`):
 * help is not a setting. `/help/faq` is the link to hand someone who asks what
 * the app stores; `/help/support` the one for someone who needs support.
 */
export function Help() {
  const { t } = useTranslation();
  const [tab, setTab] = usePageTab(HELP_TABS);
  const tabsId = useTabsId();

  return (
    // Prose, so narrower than the app-wide `max-w-6xl` data width: the cards
    // sit at a readable line length and the text fills them edge to edge.
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
