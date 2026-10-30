import { lazy, Suspense, startTransition } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Spinner, Tabs, useTabsId } from '@/components/ui';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { usePageTab } from '@/lib/usePageTab';
import { MINING_TABS } from '@/app/pageTabs';
import { guarded } from '@/app/routeChunks';

const TaxTab = lazy(() =>
  guarded(() => import('@/features/miningTax/TaxTab')).then((m) => ({ default: m.TaxTab }))
);
const OverviewTab = lazy(() =>
  guarded(() => import('@/features/miningTax/OverviewTab')).then((m) => ({
    default: m.OverviewTab,
  }))
);
const SurveyTab = lazy(() =>
  guarded(() => import('@/features/survey/SurveyTab')).then((m) => ({ default: m.SurveyTab }))
);

/**
 * Mining (issue #671): renamed from "Moon Mining" — every internal
 * module/component name stays `MoonMiningTax`/`miningTax` (decision doc
 * `20260905-215631`), a label/structure change only. The route *path* that
 * doc kept at `/moon-mining` moved again under #1304, to `/mining` with its
 * tabs as path segments (`/mining/overview`, `/mining/tax`) — #1304's own
 * decision doc supersedes only that path call, not the module-naming one.
 * `Overview` (default, and first in the bar) is the personal-output stats
 * tab; `Tax` is the rent/tax ledger. The two tabs load independent data, so each
 * owns its own fetch/refresh lifecycle rather than sharing one snapshot —
 * this shell only resolves the active Character gate they'd otherwise each
 * repeat.
 *
 * Which is why each tab, not this shell, renders the page's `PageHeader`: the
 * header's `actions` cluster is that tab's own controls (refresh, and on Tax
 * the Payees and Ore tags dialogs), every one of them reading the snapshot
 * hook the tab owns. A shell-owned header would have to take all of that back
 * up through props to render it.
 *
 * That also retires the `onDataAgeChange` callback #896 added. Its only job
 * was carrying a tab's `fetchedAt` up to a header the tab didn't render, so
 * the badge could sit beside the title instead of in a tab-local row. The
 * badge still sits beside the title — the tab reads `fetchedAt` straight from
 * its own snapshot now, and there is no timestamp to report anywhere, nor a
 * stale one to reset on tab switch.
 *
 * The tab bar is the one piece both tabs share, so it is built once here and
 * handed down.
 */
export function MoonMiningTax() {
  const { t } = useTranslation();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const hydrated = useActiveCharacter((state) => state.hydrated);
  const [tab, setTab] = usePageTab(MINING_TABS);
  const tabsId = useTabsId();

  if (!hydrated) {
    return <Spinner block="page" label={t('common.loading')} />;
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;

  const tabBar = (
    <Tabs
      tabsId={tabsId}
      label={t('miningTax.title')}
      value={tab}
      // Transition: a cold tab chunk keeps the old tab (and focus) until it lands.
      onChange={(id) => startTransition(() => setTab(id as typeof tab))}
      tabs={MINING_TABS.tabs.map((item) => ({ id: item.id, label: t(item.labelKey) }))}
    />
  );

  return (
    <div className="mx-auto max-w-page space-y-4">
      <Suspense fallback={<Spinner block="page" label={t('common.loading')} />}>
        {tab === 'overview' && <OverviewTab tabBar={tabBar} tabsId={tabsId} />}
        {tab === 'tax' && <TaxTab tabBar={tabBar} tabsId={tabsId} />}
        {tab === 'survey' && <SurveyTab tabBar={tabBar} tabsId={tabsId} />}
      </Suspense>
    </div>
  );
}
