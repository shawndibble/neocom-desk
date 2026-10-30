import { useTranslation } from 'react-i18next';
import { PageHeader, Tabs, useTabPanelProps, useTabsId } from '@/components/ui';
import { cx } from '@/lib/cx';
import { usePageTab } from '@/lib/usePageTab';
import { SRP_TABS } from './srpTabs';
import { SRP_VIEWS } from './srpViews';

/**
 * `/corp/srp`'s body: the page header and the officer views `srpViews.ts`
 * lists for this pilot. One view renders bare; two or more get a tab bar (`SRP_TABS`, a path
 * segment). A tab the pilot has no view for (a stale link, or Queue where SRP is off) falls back
 * to the first they have.
 */
export function SrpPage({
  canManageSrp,
  srpOn,
  isDirector,
}: {
  canManageSrp: boolean;
  srpOn: boolean;
  isDirector: boolean;
}) {
  const { t } = useTranslation();
  const tabsId = useTabsId();
  const [tab, selectTab] = usePageTab(SRP_TABS);
  const views = SRP_VIEWS.filter((v) => v.visible({ canManageSrp, srpOn, isDirector }));
  const view = views.find((v) => v.id === tab) ?? views[0];
  const {
    ref: fadeRef,
    className: panelRing,
    ...panelAttrs
  } = useTabPanelProps(tabsId, view?.id ?? tab);
  if (!view) return null;
  const View = view.component;
  const tabbed = views.length > 1;
  return (
    <div className={cx('mx-auto grid gap-4 px-4 py-4', view.wide ? 'max-w-6xl' : 'max-w-5xl')}>
      <PageHeader title={t('srp.title')} />
      {tabbed && (
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
      {/* One wrapper either way: a second view appearing (SRP turned on) must
          not remount the first. The tabpanel role only comes with the bar. */}
      <div ref={fadeRef} {...(tabbed && panelAttrs)} className={cx(tabbed && panelRing)}>
        <View />
      </div>
    </div>
  );
}
