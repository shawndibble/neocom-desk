import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Spinner, Tabs } from '@/components/ui';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { TaxTab } from '@/features/miningTax/TaxTab';
import { OverviewTab } from '@/features/miningTax/OverviewTab';

type MiningTab = 'tax' | 'overview';

/**
 * Mining (issue #671): renamed from "Moon Mining" — the route path and every
 * internal module/component name stay `MoonMiningTax`/`miningTax`
 * (decision doc `20260905-215631`), this is a label/structure change only.
 * `Tax` (default) is the unchanged rent/tax ledger; `Overview` is the new
 * personal-output stats tab. The two tabs load independent data, so each
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
  const [tab, setTab] = useState<MiningTab>('tax');

  if (!hydrated) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;

  const tabBar = (
    <Tabs
      label={t('miningTax.title')}
      value={tab}
      onChange={(id) => setTab(id as MiningTab)}
      tabs={[
        { id: 'tax', label: t('miningTax.taxTab') },
        { id: 'overview', label: t('miningTax.overviewTab') },
      ]}
    />
  );

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      {tab === 'tax' ? <TaxTab tabBar={tabBar} /> : <OverviewTab tabBar={tabBar} />}
    </div>
  );
}
