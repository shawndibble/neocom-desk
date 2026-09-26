import { useTranslation } from 'react-i18next';
import { Tabs } from '@/components/ui';
import { tabBarTabs } from '@/lib/pageTabs';
import { usePageTab } from '@/lib/usePageTab';
import { SHIPS_TABS, type ShipsTab } from './shipsTabs';

/** The Ships section's tab bar — Fittings, Tree — under the page header, as Industry's is. */
export function ShipsTabBar() {
  const { t } = useTranslation();
  const [tab, setTab] = usePageTab(SHIPS_TABS);
  return (
    <Tabs
      label={t('nav.ships')}
      value={tab}
      onChange={(id) => setTab(id as ShipsTab)}
      tabs={tabBarTabs(SHIPS_TABS).map((item) => ({ id: item.id, label: t(item.labelKey) }))}
    />
  );
}
