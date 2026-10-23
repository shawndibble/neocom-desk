import { useTranslation } from 'react-i18next';
import { PageHeader, Tabs, useTabsId } from '@/components/ui';
import { usePageTab } from '@/lib/usePageTab';
import { SRP_TABS } from './srpTabs';
import { SRP_VIEWS } from './srpViews';

/**
 * `/corp/srp`'s body (issues #4851, #4852): the page header and the views `srpViews.ts` lists
 * for this pilot. One view renders bare; two or more get a tab bar (`SRP_TABS`, a path segment).
 * A tab the pilot has no view for (a stale link) falls back to the first they have.
 */
export function SrpPage({ canManageSrp, srpOn }: { canManageSrp: boolean; srpOn: boolean }) {
  const { t } = useTranslation();
  const tabsId = useTabsId();
  const [tab, selectTab] = usePageTab(SRP_TABS);
  const views = SRP_VIEWS.filter((v) => v.visible({ canManageSrp, srpOn }));
  const view = views.find((v) => v.id === tab) ?? views[0];
  if (!view) return null;
  const View = view.component;
  return (
    <div className="mx-auto grid max-w-5xl gap-4 px-4 py-4">
      <PageHeader title={t('srp.title')} />
      {views.length > 1 && (
        <Tabs
          tabsId={tabsId}
          label={t('srp.title')}
          value={view.id}
          onChange={(id) => {
            const next = views.find((v) => v.id === id);
            if (next) selectTab(next.id);
          }}
          tabs={views.map((v) => ({
            id: v.id,
            label: t(SRP_TABS.tabs.find((x) => x.id === v.id)?.labelKey ?? 'srp.title'),
          }))}
        />
      )}
      <View />
    </div>
  );
}
