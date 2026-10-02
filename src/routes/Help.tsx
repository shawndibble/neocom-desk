import { useTranslation } from 'react-i18next';
import { PageHeader, Tabs } from '@/components/ui';
import { usePageTab } from '@/lib/usePageTab';
import { HELP_TABS } from '@/app/pageTabs';
import { FaqPanel } from '@/features/faq/FaqPanel';
import { HelpPanel } from '@/features/help/HelpPanel';

/**
 * Help & FAQ, a footer page of its own rather than two Settings sections
 * (scope decision `20261002-145653-lp-store-under-market-pilot-lookup-its-own`):
 * help is not a setting. `/help/faq` is the link to hand someone who asks what
 * the app stores; `/help/support` the one for someone who needs support.
 */
export function Help() {
  const { t } = useTranslation();
  const [tab, setTab] = usePageTab(HELP_TABS);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader title={t('nav.help')} />
      <Tabs
        label={t('nav.help')}
        value={tab}
        onChange={(id) => setTab(id as typeof tab)}
        tabs={HELP_TABS.tabs.map((item) => ({ id: item.id, label: t(item.labelKey) }))}
      />
      {tab === 'support' ? <HelpPanel /> : <FaqPanel />}
    </div>
  );
}
