import { useTranslation } from 'react-i18next';
import { PageHeader, Tabs, useTabsId } from '@/components/ui';
import { cx } from '@/lib/cx';
import { usePageTab } from '@/lib/usePageTab';
import { SRP_TABS } from './srpPaths';
import { SRP_VIEWS } from './srpViews';

/**
 * `/corp/srp`'s body (issues #4851, #4853): the page header and the views `srpViews.ts` lists for
 * this pilot. One view renders bare; two or more get a tab bar whose tab is the URL segment
 * (`srpPaths.ts`, registered in `pageTabs.ts`). A tab the pilot may not see falls back to the
 * first view they may.
 */
export function SrpPage({ canManageSrp }: { canManageSrp: boolean }) {
  const { t } = useTranslation();
  const tabsId = useTabsId();
  const views = SRP_VIEWS.filter((v) => v.visible({ canManageSrp }));
  const [selected, select] = usePageTab(SRP_TABS);
  const view = views.find((v) => v.id === selected) ?? views[0];
  if (!view) return null;
  const View = view.component;
  return (
    <div className={cx('mx-auto grid gap-4 px-4 py-4', view.wide ? 'max-w-6xl' : 'max-w-4xl')}>
      <PageHeader title={t('srp.title')} />
      {views.length > 1 && (
        <Tabs
          tabsId={tabsId}
          label={t('srp.title')}
          value={view.id}
          onChange={(id) =>
            select(SRP_TABS.tabs.find((tab) => tab.id === id)?.id ?? SRP_TABS.defaultTab)
          }
          tabs={views.map((v) => ({ id: v.id, label: t(v.labelKey) }))}
        />
      )}
      <View />
    </div>
  );
}
