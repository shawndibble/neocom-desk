import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader, Tabs, useTabsId } from '@/components/ui';
import { SRP_VIEWS } from './srpViews';

/**
 * `/corp/srp`'s body (issue #4851): the page header and the views `srpViews.ts` lists for this
 * pilot. One view renders bare; two or more get a tab bar (local state, no URL segment yet:
 * when the second view lands, register `/corp/srp` in `pageTabs.ts` and swap `useState` for
 * `usePageTab`, as the Moons page does).
 */
export function SrpPage({ canManageSrp }: { canManageSrp: boolean }) {
  const { t } = useTranslation();
  const tabsId = useTabsId();
  const views = SRP_VIEWS.filter((v) => v.visible({ canManageSrp }));
  const [selected, setSelected] = useState<string | null>(null);
  const view = views.find((v) => v.id === selected) ?? views[0];
  if (!view) return null;
  const View = view.component;
  return (
    <div className="mx-auto grid max-w-4xl gap-4 px-4 py-4">
      <PageHeader title={t('srp.title')} />
      {views.length > 1 && (
        <Tabs
          tabsId={tabsId}
          label={t('srp.title')}
          value={view.id}
          onChange={setSelected}
          tabs={views.map((v) => ({ id: v.id, label: t(v.labelKey) }))}
        />
      )}
      <View />
    </div>
  );
}
